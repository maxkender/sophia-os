import { listerDiaporamas, listerPostsProfil, scrapePosts, type ScrapedPost } from "../_shared/apify.ts";
import {
  apresEchec,
  BUDGET_PASSAGE_MS,
  COMPTES_PAR_PASSAGE,
  idPost,
  LECTURES_PAR_PASSAGE,
  lireLignes,
  MAX_LIGNES_PAR_ENVOI,
  motifRefus,
  OCR_EN_PARALLELE,
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
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

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
 *       Un passage (la tâche planifiée, chaque minute s'il reste du travail) :
 *       cherche quelques comptes (leurs 5 slideshows les plus récents et leurs
 *       5 plus likés) et lit quelques slideshows (Apify, puis OCR des slides).
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

      // Démarrer sans attendre la prochaine minute, sauf si un passage tourne déjà.
      if ((ajoutes > 0 || nouveaux.length > 0) && !(await passageEnCours(supabase))) {
        enArrierePlan(passage(supabase));
      }
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
      if (!(await passageEnCours(supabase))) enArrierePlan(passage(supabase));
      return json({ ok: true, relances: data?.length ?? 0 });
    }

    if (body.tourner) {
      return json({ ok: true, ...(await passage(supabase)) });
    }

    return json({ error: "Demande inconnue : ajouter, relire ou tourner." }, 400);
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

/** Une ligne prise il y a moins de 2 minutes : un passage tourne. */
async function passageEnCours(supabase: Client): Promise<boolean> {
  const depuis = new Date(Date.now() - 2 * 60_000).toISOString();
  const [comptes, exemples] = await Promise.all([
    supabase.from("exemples_natifs_comptes").select("id").eq("statut", "en_attente").gt("pris_le", depuis).limit(1),
    supabase.from("exemples_natifs").select("id").eq("statut", "en_attente").gt("pris_le", depuis).limit(1),
  ]);
  return Boolean(comptes.data?.length || exemples.data?.length);
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
  const { data, error } = await supabase.rpc("exemples_natifs_prendre_comptes", { p_n: COMPTES_PAR_PASSAGE });
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
  const { data, error } = await supabase.rpc("exemples_natifs_prendre_lectures", { p_n: LECTURES_PAR_PASSAGE });
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
  await enParallele(slides, OCR_EN_PARALLELE, async ({ i, j, url }) => {
    if (Date.now() - debut > BUDGET_PASSAGE_MS) return;
    textes[i][j] = await ocrFrame(url).catch(() => "");
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
