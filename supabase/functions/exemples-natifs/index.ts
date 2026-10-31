import { listerDiaporamas, listerPostsProfil, scrapePosts, type ScrapedPost } from "../_shared/apify.ts";
import {
  apresEchec,
  BUDGET_PASSAGE_MS,
  type Charge,
  COMPTES_PAR_OUVRIER,
  idPost,
  LECTURES_PAR_OUVRIER,
  lireLignes,
  MAX_LIGNES_PAR_ENVOI,
  motifRefus,
  OCR_EN_PARALLELE,
  ouvriersALancer,
  POSTS_LUS_PAR_COMPTE,
  postDuLien,
  pseudoDuLien,
  SLIDESHOWS_PLUS_LIKES,
  SLIDESHOWS_RECENTS,
  slideshowsDuCompte,
  slidesLues,
} from "../_shared/exemples_natifs.ts";
import { ocrFrame } from "../_shared/gemini.ts";
import { LANGUES_CIBLES } from "../_shared/langues_cibles.ts";
import { enParallele } from "../_shared/nettoyage_stickers.ts";
import { assertAuthorised, json, messageErreur, secretCronConnu, serviceClient } from "../_shared/supabase.ts";

/**
 * Banque d'exemples natifs (0423, sur le serveur depuis 0618) : des slideshows
 * de vrais créateurs de chaque langue, lus par la traduction ancrée.
 *
 *   { ajouter: { langue, labelId?, texte } }
 *       Note les liens et comptes collés, puis répond aussitôt : l'admin peut
 *       fermer la page. Un lien de slideshow entre dans la banque « en
 *       attente » ; un compte entre dans la file des comptes à chercher.
 *       → { ajoutes, deja, comptes, dejaEnFile, ignorees }
 *   { relire: { ids } }
 *       Remet des exemples en file de lecture. → { relances }
 *   { tourner: {} }
 *       La tâche planifiée (chaque minute s'il reste du travail) : lance des
 *       ouvriers en parallèle, OUVRIERS_MAX au plus, et répond aussitôt.
 *   { ouvrier: {} }
 *       Un ouvrier répond aussitôt puis, en arrière-plan, cherche quelques
 *       comptes (leurs 5 slideshows les plus récents et leurs 5 plus likés)
 *       et lit quelques slideshows (Apify, puis OCR des slides). S'il reste
 *       du travail, il lance un ouvrier pour prendre la suite.
 *
 * Rien n'est publié : ces slideshows ne deviennent jamais des contenus.
 */

type Client = ReturnType<typeof serviceClient>;

interface CompteEnFile {
  id: string;
  langue: string;
  pseudo: string;
  label_id: string | null;
  tentatives: number;
}

interface ExempleEnFile {
  id: string;
  source_url: string;
  tentatives: number;
}

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  try {
    const body = (await request.json()) as {
      ajouter?: { langue?: string; labelId?: string | null; texte?: string };
      relire?: { ids?: string[] };
      tourner?: unknown;
      ouvrier?: unknown;
    };

    if (body.ajouter) {
      const langue = String(body.ajouter.langue ?? "");
      if (!(LANGUES_CIBLES as readonly string[]).includes(langue)) {
        return json({ error: `Langue inconnue : « ${langue} »` }, 400);
      }
      const labelId = body.ajouter.labelId || null;
      const lues = lireLignes(String(body.ajouter.texte ?? ""));
      if (lues.posts.length + lues.comptes.length > MAX_LIGNES_PAR_ENVOI) {
        return json({ error: `${MAX_LIGNES_PAR_ENVOI} lignes au plus par envoi : colle en plusieurs fois.` }, 400);
      }

      const { ajoutes, deja } = await insererExemples(supabase, langue, labelId, lues.posts);

      // Un compte déjà en file pour cette langue n'y entre pas deux fois.
      const { data: enFile, error: erreurFile } = await supabase
        .from("exemples_natifs_comptes")
        .select("pseudo")
        .eq("langue", langue)
        .eq("statut", "en_attente")
        .in("pseudo", lues.comptes.length ? lues.comptes : ["-"]);
      if (erreurFile) return json({ error: erreurFile.message }, 500);
      const dejaEnFile = new Set((enFile ?? []).map((c) => c.pseudo as string));
      const nouveaux = lues.comptes.filter((p) => !dejaEnFile.has(p));
      if (nouveaux.length) {
        const { error } = await supabase
          .from("exemples_natifs_comptes")
          .insert(nouveaux.map((pseudo) => ({ langue, pseudo, label_id: labelId })));
        if (error) return json({ error: error.message }, 500);
      }

      // Démarrer sans attendre la prochaine minute.
      if (ajoutes > 0 || nouveaux.length > 0) await lancerOuvriers(supabase);
      return json({
        ok: true,
        ajoutes,
        deja,
        comptes: nouveaux.length,
        dejaEnFile: dejaEnFile.size,
        ignorees: lues.ignorees,
      });
    }

    if (body.relire) {
      const ids = (body.relire.ids ?? []).filter((id) => typeof id === "string" && id).slice(0, 500);
      if (!ids.length) return json({ error: "Aucun exemple à relire." }, 400);
      const { data, error } = await supabase
        .from("exemples_natifs")
        .update({ statut: "en_attente", erreur: null, pris_le: null, tentatives: 0 })
        .in("id", ids)
        .select("id");
      if (error) return json({ error: error.message }, 500);
      await lancerOuvriers(supabase);
      return json({ ok: true, relances: data?.length ?? 0 });
    }

    // Répondre vite : la tâche planifiée passe par pg_net, qui attend la fin
    // de ses appels avant d'en envoyer d'autres.
    if (body.tourner) {
      return json({ ok: true, ouvriers: await lancerOuvriers(supabase) });
    }

    if (body.ouvrier) {
      enArrierePlan(
        passage(supabase).then(async () => {
          // Il reste du travail libre : un ouvrier prend la suite, sans attendre la minute.
          if (ouvriersALancer(await charge(supabase)) > 0) lancerOuvrier();
        }),
      );
      return json({ ok: true });
    }

    return json({ error: "Demande inconnue : ajouter, relire, tourner ou ouvrier." }, 400);
  } catch (erreur) {
    return json({ error: messageErreur(erreur) }, 500);
  }
});

/** Un travail qui continue après la réponse ; la tâche planifiée prend la suite chaque minute. */
function enArrierePlan(travail: Promise<unknown>) {
  const suivi = travail.catch((erreur) => console.error(`exemples-natifs : ${messageErreur(erreur)}`));
  const edge = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge) edge.waitUntil(suivi);
}

/** Le travail libre et le travail pris (il y a moins de 5 minutes, comme dans 0618). */
async function charge(supabase: Client): Promise<Charge> {
  const limite = new Date(Date.now() - 5 * 60_000).toISOString();
  const compter = async (table: string, pris: boolean) => {
    const base = supabase.from(table).select("id", { count: "exact", head: true }).eq("statut", "en_attente");
    const { count, error } = await (pris
      ? base.gt("pris_le", limite)
      : base.or(`pris_le.is.null,pris_le.lt."${limite}"`));
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [comptesLibres, comptesPris, lecturesLibres, lecturesPrises] = await Promise.all([
    compter("exemples_natifs_comptes", false),
    compter("exemples_natifs_comptes", true),
    compter("exemples_natifs", false),
    compter("exemples_natifs", true),
  ]);
  return { comptesLibres, comptesPris, lecturesLibres, lecturesPrises };
}

/** Lance assez d'ouvriers pour le travail libre, OUVRIERS_MAX au plus avec ceux qui tournent. */
async function lancerOuvriers(supabase: Client): Promise<number> {
  const n = ouvriersALancer(await charge(supabase));
  for (let i = 0; i < n; i += 1) lancerOuvrier();
  return n;
}

/** Un ouvrier : un appel de la fonction à elle-même, qui répond aussitôt et travaille en arrière-plan. */
function lancerOuvrier() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = secretCronConnu();
  if (!url || !secret) {
    console.error("exemples-natifs : SUPABASE_URL ou CRON_SECRET manquant, aucun ouvrier lancé");
    return;
  }
  enArrierePlan(
    fetch(`${url}/functions/v1/exemples-natifs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ ouvrier: {} }),
    }).then((r) => r.body?.cancel()),
  );
}

async function passage(supabase: Client) {
  const debut = Date.now();
  const [comptes, lectures] = await Promise.all([chercherComptes(supabase), lireExemples(supabase, debut)]);
  if (comptes + lectures.prets + lectures.erreurs + lectures.reportes > 0) {
    console.log(
      `exemples-natifs : ${comptes} compte(s) cherché(s), ${lectures.prets} slideshow(s) prêt(s), ` +
        `${lectures.erreurs} écarté(s), ${lectures.reportes} reporté(s), ${Math.round((Date.now() - debut) / 1000)} s`,
    );
  }
  return { comptes, ...lectures };
}

/** Ajoute des liens à la banque, en attente de lecture ; un lien déjà connu n'est pas recréé. */
async function insererExemples(
  supabase: Client,
  langue: string,
  labelId: string | null,
  urls: string[],
): Promise<{ ajoutes: number; deja: number }> {
  if (!urls.length) return { ajoutes: 0, deja: 0 };
  const { data, error } = await supabase
    .from("exemples_natifs")
    .upsert(
      urls.map((source_url) => ({ langue, source_url, handle: pseudoDuLien(source_url), label_id: labelId })),
      { onConflict: "langue,source_url", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  const ajoutes = data?.length ?? 0;
  return { ajoutes, deja: urls.length - ajoutes };
}

// ---------------------------------------------------------------------------
// Les comptes : leurs slideshows les plus récents et les plus likés
// ---------------------------------------------------------------------------

async function chercherComptes(supabase: Client): Promise<number> {
  const { data, error } = await supabase.rpc("exemples_natifs_prendre_comptes", { p_n: COMPTES_PAR_OUVRIER });
  if (error) throw new Error(error.message);
  const pris = (data ?? []) as CompteEnFile[];
  await Promise.all(pris.map((c) => chercherCompte(supabase, c)));
  return pris.length;
}

async function chercherCompte(supabase: Client, c: CompteEnFile) {
  // La page publique du compte (gratuite) dit quels posts sont des slideshows,
  // ce qu'Apify ne dit pas toujours sans télécharger.
  const [page, liste] = await Promise.all([
    listerDiaporamas(c.pseudo).catch(() => [] as string[]),
    listerPostsProfil(c.pseudo, POSTS_LUS_PAR_COMPTE).catch((erreur) => erreur as Error),
  ]);
  let trouves: string[];
  let posts: number;
  let verifies: boolean;
  if (liste instanceof Error) {
    if (page.length === 0) {
      // Apify a pu caler une minute : nouvel essai au passage suivant.
      const { error } = await supabase
        .from("exemples_natifs_comptes")
        .update({ ...apresEchec(c.tentatives, `Apify : ${messageErreur(liste)}`), pris_le: null })
        .eq("id", c.id);
      if (error) console.error(`exemples-natifs @${c.pseudo} : ${error.message}`);
      return;
    }
    // Apify en panne mais la page publique répond : ses slideshows suffisent.
    trouves = page.slice(0, SLIDESHOWS_RECENTS + SLIDESHOWS_PLUS_LIKES);
    posts = page.length;
    verifies = true;
  } else {
    const choix = slideshowsDuCompte(liste, new Set(page.map((u) => idPost(u) ?? "")));
    trouves = choix.urls;
    posts = liste.length;
    verifies = choix.verifies;
  }
  const { ajoutes } = await insererExemples(supabase, c.langue, c.label_id, trouves);
  console.log(
    `exemples-natifs @${c.pseudo} : ${posts} posts, ${page.length} slideshows sur la page, ` +
      `${trouves.length} retenus${verifies ? "" : " (type non reconnu, vérifié à la lecture)"}, ${ajoutes} nouveaux`,
  );
  const { error } = await supabase
    .from("exemples_natifs_comptes")
    .update({ statut: "fait", posts, slideshows: trouves.length, verifies, ajoutes, erreur: null, pris_le: null })
    .eq("id", c.id);
  if (error) console.error(`exemples-natifs @${c.pseudo} : ${error.message}`);
}

// ---------------------------------------------------------------------------
// Les slideshows : un run Apify pour tous, puis l'OCR de chaque slide
// ---------------------------------------------------------------------------

async function lireExemples(supabase: Client, debut: number) {
  const bilan = { prets: 0, erreurs: 0, reportes: 0 };
  const { data, error } = await supabase.rpc("exemples_natifs_prendre_lectures", { p_n: LECTURES_PAR_OUVRIER });
  if (error) throw new Error(error.message);
  const pris = (data ?? []) as ExempleEnFile[];
  if (!pris.length) return bilan;

  const maj = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("exemples_natifs").update({ ...patch, pris_le: null }).eq("id", id);
    if (error) console.error(`exemples-natifs ${id} : ${error.message}`);
  };

  let posts: ScrapedPost[];
  try {
    posts = await scrapePosts(pris.map((e) => e.source_url));
  } catch (erreur) {
    // Nouvel essai au passage suivant, trois au plus.
    const motif = `Apify : ${messageErreur(erreur)}`;
    await Promise.all(pris.map((e) => maj(e.id, apresEchec(e.tentatives, motif))));
    bilan.reportes += pris.length;
    return bilan;
  }

  // Toutes les slides de tous les slideshows passent à l'OCR, OCR_EN_PARALLELE
  // à la fois. Passé le budget, plus rien ne part : null = slide non lue.
  const lus = pris.map((e) => ({ exemple: e, post: postDuLien(e.source_url, posts) }));
  const slides = lus.flatMap((l, i) => (l.post?.imageUrls ?? []).map((url, j) => ({ i, j, url })));
  const textes = lus.map((l) => new Array<string | null>(l.post?.imageUrls.length ?? 0).fill(null));
  // Une lecture ratée (Gemini saturé…) n'est pas une slide sans texte.
  const echecsOcr = lus.map(() => null as string | null);
  await enParallele(slides, OCR_EN_PARALLELE, async ({ i, j, url }) => {
    if (Date.now() - debut > BUDGET_PASSAGE_MS) return;
    try {
      textes[i][j] = await ocrFrame(url);
    } catch (erreur) {
      textes[i][j] = "";
      echecsOcr[i] = messageErreur(erreur);
    }
  });

  // Au moins une slide lue : le passage a avancé, un slideshow coupé par le
  // budget ne perd pas d'essai. Sinon (Apify a tout mangé), c'est un essai.
  const avance = textes.some((ts) => ts.some((t) => t !== null));

  await Promise.all(
    lus.map(async ({ exemple: e, post }, i) => {
      if (!post) {
        bilan.erreurs += 1;
        return await maj(e.id, { statut: "erreur", erreur: "Post introuvable, supprimé ou privé." });
      }
      if (textes[i].some((t) => t === null)) {
        // Coupé par le budget : le slideshow retourne en file.
        bilan.reportes += 1;
        return await maj(
          e.id,
          avance
            ? { tentatives: Math.max(0, e.tentatives - 1) }
            : apresEchec(e.tentatives, "Apify trop lent : slides pas lues à temps."),
        );
      }
      const lues = slidesLues(textes[i] as string[]);
      const refus = motifRefus(post.imageUrls.length, lues);
      if (refus && echecsOcr[i]) {
        // Pas assez de texte parce que l'OCR a échoué : nouvel essai au passage suivant.
        bilan.reportes += 1;
        return await maj(e.id, apresEchec(e.tentatives, `OCR : ${echecsOcr[i]}`));
      }
      if (refus) {
        bilan.erreurs += 1;
        return await maj(e.id, { statut: "erreur", erreur: refus });
      }
      bilan.prets += 1;
      await maj(e.id, {
        statut: "pret",
        erreur: null,
        slides: lues,
        vues: post.stats.vues || null,
        handle: pseudoDuLien(post.webVideoUrl) ?? pseudoDuLien(e.source_url),
      });
    }),
  );
  return bilan;
}
