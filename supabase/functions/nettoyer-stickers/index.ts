import { ocrSlideImport } from "../_shared/gemini.ts";
import { lireParLots } from "../_shared/lots.ts";
import {
  avecReprise,
  enParallele,
  formatDuree,
  ligneScan,
  motifRetrait,
  resumeIgnores,
  type SlideAnalysee,
  statutApresAnalyse,
  tierProtege,
  titreCourt,
} from "../_shared/nettoyage_stickers.ts";
import { slideshowsDuLabel } from "../_shared/nettoyage_stickers_label.ts";
import { assertRole, aujourdhuiParis, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Nettoyage stickers d'un label, mené par le serveur (migration 0317) : la page
 * peut être fermée, le cron `nettoyage-stickers-drain` reprend chaque minute.
 *
 *   {} ou { action: "drainer" }               → un passage (cron, ou relance)
 *   { action: "lancer", labelId }              → { nettoyageId } ; scan des
 *       slideshows du label (hors pods, tier A ou mieux, sans images brutes)
 *   { action: "confirmer", nettoyageId }       → retrait des slideshows à
 *       sticker PUB (sauf repêchés) et remplacement de leurs posts du jour
 *   { action: "repecher", nettoyageId, contenuId }
 *       avant le retrait : il ne sera pas jeté ; après : remis en valide
 *   { action: "rejeter", nettoyageId, contenuId }  → annule un repêchage
 *       (avant le retrait seulement)
 *   { action: "annuler", nettoyageId }         → arrête un scan / une liste
 *
 * Un passage du drain :
 *   1. retrait : réserve les slideshows à jeter par 100, revérifie ce qui les
 *      protège (encore valide, pas un pod, pas au tier A ou mieux), les passe
 *      en `rejete` en gardant de quoi les repêcher, note les posts du jour pas
 *      encore publiés qui les utilisaient ; puis remplace ces posts un à un
 *      (`revoquer-post`, même créateur, même jour, même application) ;
 *   2. scan : l'OCR d'import (`ocrSlideImport`) sur chaque slide, plusieurs
 *      slideshows à la fois. Une slide illisible fait repasser le slideshow
 *      plus tard, puis le compte en erreur : elle ne passe jamais pour propre.
 * Chaque étape s'arrête avant la coupure à 150 s ; une ligne réservée par un
 * passage mort est reprise par un suivant (réservations SKIP LOCKED).
 */

type Client = ReturnType<typeof serviceClient>;

/** On ne réserve plus de slideshow à analyser au-delà (un slideshow dure ~10-40 s). */
const BUDGET_SCAN_MS = 90_000;
/** On ne lance plus de remplacement au-delà : un remplacement dure jusqu'à ~110 s. */
const BUDGET_REMPLACEMENT_MS = 30_000;
const DELAI_REMPLACEMENT_MS = 110_000;
/**
 * Slideshows analysés en même temps par passage, et slides par slideshow.
 * 6 × 3 faisait ~30 slideshows / min (alpha_male_yellow, 19/10) : un appel
 * Gemini dure ~7 s, le téléchargement est court. 10 × 5 = 50 appels en vol :
 * ~3× plus vite, en restant loin de la mémoire de la fonction (chaque image
 * en base64 est gardée le temps de son appel).
 */
const OUVRIERS_SCAN = 10;
const SLIDES_EN_PARALLELE = 5;
/** Remplacements menés en même temps (chacun relance une assignation). */
const OUVRIERS_REMPLACEMENT = 2;
const TENTATIVES_REMPLACEMENT = 2;
const LOT_RETRAIT = 100;
const LOT_INSERTION = 500;

const ACTIFS = ["scan", "retrait"];

interface Tache {
  id: string;
  label_id: string | null;
  label_nom: string;
  statut: string;
  created_at: string;
  retrait_lance_at: string | null;
}

interface LigneSlideshow {
  nettoyage_id: string;
  contenu_id: string;
  titre: string | null;
  slides: Array<{ position: number; url: string }>;
  statut: string;
  tentatives: number;
  avant: Record<string, unknown> | null;
}

interface LignePost {
  nettoyage_id: string;
  post_id: string;
  contenu_id: string | null;
  tentatives: number;
}

async function journal(supabase: Client, nettoyageId: string, lignes: string | string[]) {
  const liste = Array.isArray(lignes) ? lignes : [lignes];
  if (liste.length === 0) return;
  const { error } = await supabase
    .from("nettoyages_stickers_journal")
    .insert(liste.map((ligne) => ({ nettoyage_id: nettoyageId, ligne })));
  if (error) throw error;
}

async function compteurs(supabase: Client, nettoyageId: string) {
  const { data, error } = await supabase.rpc("nettoyage_stickers_compteurs", { p_nettoyage: nettoyageId });
  if (error) throw error;
  const c = (data ?? {}) as { slideshows?: Record<string, number>; posts?: Record<string, number> };
  const s = c.slideshows ?? {};
  const p = c.posts ?? {};
  return { s: (k: string) => s[k] ?? 0, p: (k: string) => p[k] ?? 0 };
}

/** Relance un passage tout de suite, sans attendre le cron (appel non attendu). */
function relancer() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!url || !secret) return;
  const p = fetch(`${url}/functions/v1/nettoyer-stickers`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({ action: "drainer" }),
  }).catch(() => null);
  const edge = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p);
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

async function analyserSlideshow(supabase: Client, ligne: LigneSlideshow) {
  const slides = await enParallele(ligne.slides ?? [], SLIDES_EN_PARALLELE, async (s): Promise<SlideAnalysee> => {
    try {
      const { sticker } = await avecReprise(() => ocrSlideImport(s.url));
      return { position: s.position, url: s.url, sticker };
    } catch (error) {
      return { position: s.position, url: s.url, sticker: null, erreur: messageErreur(error) };
    }
  });
  const { statut, erreur } = statutApresAnalyse(slides, ligne.tentatives);
  const { error } = await supabase
    .from("nettoyages_stickers_slideshows")
    .update({ slides, statut, erreur, reserve_at: null, maj_at: new Date().toISOString() })
    .eq("nettoyage_id", ligne.nettoyage_id)
    .eq("contenu_id", ligne.contenu_id)
    .eq("statut", "analyse");
  if (error) throw error;
  await journal(supabase, ligne.nettoyage_id, ligneScan(titreCourt(ligne.titre, ligne.contenu_id), statut, slides, erreur));
}

async function scanner(supabase: Client, tache: Tache, debut: number) {
  let analyses = 0;
  const ouvrier = async () => {
    while (Date.now() - debut < BUDGET_SCAN_MS) {
      const { data, error } = await supabase.rpc("nettoyage_stickers_reserver", {
        p_nettoyage: tache.id,
        p_de: "a_analyser",
        p_vers: "analyse",
        p_n: 1,
      });
      if (error) throw error;
      const ligne = ((data ?? []) as LigneSlideshow[])[0];
      if (!ligne) return;
      await analyserSlideshow(supabase, ligne);
      analyses += 1;
    }
  };
  await Promise.all(Array.from({ length: OUVRIERS_SCAN }, ouvrier));
  await finirScan(supabase, tache);
  return analyses;
}

async function finirScan(supabase: Client, tache: Tache) {
  const c = await compteurs(supabase, tache.id);
  if (c.s("a_analyser") + c.s("analyse") > 0) return;
  const pubs = c.s("pub");
  const statut = pubs > 0 ? "a_confirmer" : "termine";
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase
    .from("nettoyages_stickers")
    .update({
      statut,
      scan_fini_at: maintenant,
      maj_at: maintenant,
      ...(statut === "termine" ? { fini_at: maintenant } : {}),
    })
    .eq("id", tache.id)
    .eq("statut", "scan")
    .select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) return; // un autre passage a conclu
  const duree = formatDuree(Date.now() - new Date(tache.created_at).getTime());
  const erreurs = c.s("erreur");
  await journal(
    supabase,
    tache.id,
    `Analyse terminée en ${duree} : ${pubs} à jeter (sticker pub)` +
      (erreurs ? `, ${erreurs} illisibles (comptés à part, gardés)` : "") +
      (pubs > 0 ? " — la liste attend ta confirmation." : " — rien à jeter."),
  );
}

// ---------------------------------------------------------------------------
// Retrait et remplacement des posts du jour
// ---------------------------------------------------------------------------

async function retirerLot(supabase: Client, tache: Tache, lot: LigneSlideshow[]) {
  const ids = lot.map((l) => l.contenu_id);
  const { data: contenus, error } = await supabase
    .from("contenus")
    .select("id, statut, pod, tier, import_etape, import_erreur, pertinence_raison")
    .in("id", ids);
  if (error) throw error;
  const { data: tiersApps, error: eTiers } = await supabase
    .from("contenu_application_tier_etat")
    .select("contenu_id, tier, eligible")
    .in("contenu_id", ids);
  if (eTiers) throw eTiers;

  const tiersParContenu = new Map<string, string[]>();
  for (const t of tiersApps ?? []) {
    if (!t.eligible || !t.tier) continue;
    tiersParContenu.set(t.contenu_id, [...(tiersParContenu.get(t.contenu_id) ?? []), t.tier]);
  }

  const parId = new Map((contenus ?? []).map((c) => [c.id as string, c]));
  const ignores: Array<{ id: string; raison: string }> = [];
  const aRetirer: string[] = [];
  for (const id of ids) {
    const c = parId.get(id);
    if (!c) ignores.push({ id, raison: "introuvable" });
    else if (c.statut !== "valide") ignores.push({ id, raison: `déjà ${c.statut}` });
    else if (c.pod) ignores.push({ id, raison: "pod" });
    else if (tierProtege([c.tier, ...(tiersParContenu.get(id) ?? [])])) ignores.push({ id, raison: "tier A ou mieux" });
    else aRetirer.push(id);
  }

  if (aRetirer.length > 0) {
    const { error: eMaj } = await supabase
      .from("contenus")
      .update({ statut: "rejete", import_etape: "sticker", import_erreur: motifRetrait(tache.label_nom) })
      .in("id", aRetirer)
      .eq("statut", "valide");
    if (eMaj) throw eMaj;
  }

  const maintenant = new Date().toISOString();
  const lignes = [
    ...aRetirer.map((id) => {
      const c = parId.get(id)!;
      return {
        nettoyage_id: tache.id,
        contenu_id: id,
        statut: "retire",
        raison: null,
        // Ce que le retrait écrase (et que `revoquer-post` réécrit), pour repêcher.
        avant: {
          import_etape: c.import_etape ?? null,
          import_erreur: c.import_erreur ?? null,
          pertinence_raison: c.pertinence_raison ?? null,
        },
        reserve_at: null,
        maj_at: maintenant,
      };
    }),
    ...ignores.map((i) => ({
      nettoyage_id: tache.id,
      contenu_id: i.id,
      statut: "garde",
      raison: i.raison,
      reserve_at: null,
      maj_at: maintenant,
    })),
  ];
  for (let i = 0; i < lignes.length; i += LOT_INSERTION) {
    const { error: eLignes } = await supabase
      .from("nettoyages_stickers_slideshows")
      .upsert(lignes.slice(i, i + LOT_INSERTION), { onConflict: "nettoyage_id,contenu_id" });
    if (eLignes) throw eLignes;
  }

  // Posts du jour pas encore publiés qui utilisaient un slideshow jeté.
  const jour = aujourdhuiParis();
  const passages = aRetirer.length === 0 ? [] : await lireParLots<{ post_id: string | null; contenu_id: string }>(
    aRetirer,
    "Passages du jour à remplacer",
    (l) =>
      supabase
        .from("passages")
        .select("post_id, contenu_id")
        .in("contenu_id", l)
        .eq("date_publication_prevue", jour)
        .eq("statut", "assigne")
        .is("publie_at", null)
        .not("post_id", "is", null),
  );
  const posts = new Map<string, string>();
  for (const p of passages) if (p.post_id) posts.set(p.post_id, p.contenu_id);
  if (posts.size > 0) {
    const { error: ePosts } = await supabase.from("nettoyages_stickers_posts").upsert(
      [...posts].map(([post_id, contenu_id]) => ({ nettoyage_id: tache.id, post_id, contenu_id })),
      { onConflict: "nettoyage_id,post_id", ignoreDuplicates: true },
    );
    if (ePosts) throw ePosts;
  }

  await journal(
    supabase,
    tache.id,
    `Lot : ${aRetirer.length} jetés` +
      (ignores.length ? `, ${ignores.length} laissés (${resumeIgnores(ignores)})` : "") +
      `, ${posts.size} posts du jour à remplacer`,
  );
}

async function remplacerPost(supabase: Client, post: LignePost) {
  const court = post.post_id.slice(0, 8);
  const finir = async (statut: string, champs: Record<string, unknown>, ligne: string) => {
    const { error } = await supabase
      .from("nettoyages_stickers_posts")
      .update({ statut, ...champs, reserve_at: null, maj_at: new Date().toISOString() })
      .eq("nettoyage_id", post.nettoyage_id)
      .eq("post_id", post.post_id);
    if (error) throw error;
    await journal(supabase, post.nettoyage_id, ligne);
  };

  // Le post a pu être publié ou supprimé depuis le retrait : on n'y touche plus.
  // (`revoquer-post`, côté admin, supprimerait un post même publié.)
  const { data: p, error } = await supabase.from("posts").select("id, publie_at").eq("id", post.post_id).maybeSingle();
  if (error) throw error;
  if (!p) return finir("ignore", { detail: "post déjà supprimé" }, `· post ${court} : déjà supprimé`);
  if (p.publie_at) return finir("ignore", { detail: "publié entre-temps" }, `· post ${court} : publié entre-temps, gardé`);
  // Slideshow repêché entre le retrait et ce remplacement : le post reste, et
  // surtout `revoquer-post` (révocation admin) le rejetterait de nouveau.
  if (post.contenu_id) {
    const { data: ligne, error: eL } = await supabase
      .from("nettoyages_stickers_slideshows")
      .select("statut")
      .eq("nettoyage_id", post.nettoyage_id)
      .eq("contenu_id", post.contenu_id)
      .maybeSingle();
    if (eL) throw eL;
    if (ligne?.statut === "repeche") {
      return finir("ignore", { detail: "slideshow repêché" }, `· post ${court} : slideshow repêché, post gardé`);
    }
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const secret = Deno.env.get("CRON_SECRET");
    if (!url || !secret) throw new Error("SUPABASE_URL / CRON_SECRET absents");
    const res = await fetch(`${url}/functions/v1/revoquer-post`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ postId: post.post_id }),
      signal: AbortSignal.timeout(DELAI_REMPLACEMENT_MS),
    });
    const r = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      newPostId?: string | null;
      error?: string;
      detail?: string;
    };
    if (r.newPostId) {
      return finir("remplace", { nouveau_post_id: r.newPostId }, `↻ post ${court} → nouveau post ${r.newPostId.slice(0, 8)}`);
    }
    if (res.ok && r.ok) {
      const detail = r.detail ?? r.error ?? "aucun slideshow disponible";
      return finir("sans_remplacant", { detail }, `· post ${court} : pas de remplaçant (${detail})`);
    }
    throw new Error(r.error ?? `revoquer-post HTTP ${res.status}`);
  } catch (e) {
    const message = messageErreur(e);
    if (post.tentatives < TENTATIVES_REMPLACEMENT) {
      return finir("a_remplacer", { detail: message }, `↺ post ${court} : ${message}, nouvel essai`);
    }
    return finir("erreur", { detail: message }, `⚠ post ${court} : ${message}`);
  }
}

async function retirer(supabase: Client, tache: Tache, debut: number) {
  // 1. Retrait, par lots de 100.
  while (Date.now() - debut < BUDGET_SCAN_MS) {
    const { data, error } = await supabase.rpc("nettoyage_stickers_reserver", {
      p_nettoyage: tache.id,
      p_de: "pub",
      p_vers: "retrait",
      p_n: LOT_RETRAIT,
      p_perime: "3 minutes",
    });
    if (error) throw error;
    const lot = (data ?? []) as LigneSlideshow[];
    if (lot.length === 0) break;
    await retirerLot(supabase, tache, lot);
  }

  // 2. Remplacement des posts du jour.
  const ouvrier = async () => {
    while (Date.now() - debut < BUDGET_REMPLACEMENT_MS) {
      const { data, error } = await supabase.rpc("nettoyage_stickers_reserver_posts", {
        p_nettoyage: tache.id,
        p_n: 1,
      });
      if (error) throw error;
      const post = ((data ?? []) as LignePost[])[0];
      if (!post) return;
      await remplacerPost(supabase, post);
    }
  };
  await Promise.all(Array.from({ length: OUVRIERS_REMPLACEMENT }, ouvrier));
  await finirRetrait(supabase, tache);
}

async function finirRetrait(supabase: Client, tache: Tache) {
  const c = await compteurs(supabase, tache.id);
  if (c.s("pub") + c.s("retrait") + c.p("a_remplacer") + c.p("remplacement") > 0) return;
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase
    .from("nettoyages_stickers")
    .update({ statut: "termine", fini_at: maintenant, maj_at: maintenant })
    .eq("id", tache.id)
    .eq("statut", "retrait")
    .select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) return;
  const depuis = new Date(tache.retrait_lance_at ?? tache.created_at).getTime();
  const posts = ["remplace", "sans_remplacant", "ignore", "erreur"].reduce((n, k) => n + c.p(k), 0);
  await journal(
    supabase,
    tache.id,
    `Terminé en ${formatDuree(Date.now() - depuis)} : ${c.s("retire")} jetés, ${c.s("garde")} laissés, ` +
      `${c.p("remplace")}/${posts} posts du jour remplacés` +
      (c.p("sans_remplacant") ? `, ${c.p("sans_remplacant")} sans remplaçant` : "") +
      (c.p("ignore") ? `, ${c.p("ignore")} publiés ou supprimés entre-temps` : "") +
      (c.p("erreur") ? `, ${c.p("erreur")} en erreur` : "") +
      ". Chaque slideshow jeté reste repêchable.",
  );
}

async function drainer(supabase: Client) {
  const debut = Date.now();
  const { data, error } = await supabase
    .from("nettoyages_stickers")
    .select("id, label_id, label_nom, statut, created_at, retrait_lance_at")
    .in("statut", ACTIFS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const taches = (data ?? []) as Tache[];
  // Le retrait d'abord : il est court, et un remplacement doit démarrer tôt.
  for (const t of taches.filter((x) => x.statut === "retrait")) await retirer(supabase, t, debut);
  let analyses = 0;
  for (const t of taches.filter((x) => x.statut === "scan")) analyses += await scanner(supabase, t, debut);
  return { taches: taches.length, analyses, dureeMs: Date.now() - debut };
}

// ---------------------------------------------------------------------------
// Actions de la page
// ---------------------------------------------------------------------------

async function lancer(supabase: Client, labelId: string, creePar: string | null) {
  const { data: label, error } = await supabase.from("labels").select("id, nom").eq("id", labelId).maybeSingle();
  if (error) throw error;
  if (!label) return json({ error: "Label introuvable" }, 404);

  const { data: existantes, error: eEx } = await supabase
    .from("nettoyages_stickers")
    .select("id, statut")
    .eq("label_id", labelId)
    .in("statut", [...ACTIFS, "a_confirmer"]);
  if (eEx) throw eEx;
  const enCours = (existantes ?? []).find((t) => ACTIFS.includes(t.statut));
  if (enCours) return json({ nettoyageId: enCours.id, deja: true });
  for (const t of existantes ?? []) {
    await supabase.from("nettoyages_stickers").update({ statut: "annule", maj_at: new Date().toISOString() })
      .eq("id", t.id).eq("statut", "a_confirmer");
    await journal(supabase, t.id, "Remplacé par un nouveau scan du label.");
  }

  const l = await slideshowsDuLabel(supabase, labelId);
  const { data: tache, error: eT } = await supabase
    .from("nettoyages_stickers")
    .insert({
      label_id: labelId,
      label_nom: label.nom,
      statut: l.slideshows.length > 0 ? "scan" : "termine",
      total: l.total,
      pods: l.pods,
      proteges: l.proteges,
      sans_images: l.sansImages,
      cree_par: creePar,
      ...(l.slideshows.length > 0 ? {} : { scan_fini_at: new Date().toISOString(), fini_at: new Date().toISOString() }),
    })
    .select("id")
    .single();
  if (eT) throw eT;

  const lignes = l.slideshows.map((s) => ({
    nettoyage_id: tache.id,
    contenu_id: s.id,
    titre: s.titre,
    tier: s.tier,
    contenu_cree_at: s.created_at,
    slides: s.slides,
  }));
  for (let i = 0; i < lignes.length; i += LOT_INSERTION) {
    const { error: eL } = await supabase.from("nettoyages_stickers_slideshows").insert(lignes.slice(i, i + LOT_INSERTION));
    if (eL) throw eL;
  }
  await journal(supabase, tache.id, [
    `Label « ${label.nom} » : ${l.total} slideshows valides — ${l.slideshows.length} à analyser · ` +
      `${l.proteges} gardés (tier A ou mieux) · ${l.pods} pods · ${l.sansImages} sans images brutes`,
    l.slideshows.length > 0
      ? "Le scan tourne sur le serveur : la page peut être fermée."
      : "Rien à analyser.",
  ]);
  if (l.slideshows.length > 0) relancer();
  return json({ nettoyageId: tache.id });
}

async function confirmer(supabase: Client, nettoyageId: string) {
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase
    .from("nettoyages_stickers")
    .update({ statut: "retrait", retrait_lance_at: maintenant, maj_at: maintenant })
    .eq("id", nettoyageId)
    .eq("statut", "a_confirmer")
    .select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) return json({ error: "Rien à confirmer (scan pas fini, ou déjà lancé)" }, 409);
  const c = await compteurs(supabase, nettoyageId);
  await journal(
    supabase,
    nettoyageId,
    `Retrait lancé : ${c.s("pub")} slideshows à jeter` +
      (c.s("repeche") ? ` (${c.s("repeche")} repêchés, gardés)` : "") +
      " — tourne sur le serveur, la page peut être fermée.",
  );
  relancer();
  return json({ ok: true });
}

async function repecher(supabase: Client, nettoyageId: string, contenuId: string) {
  const { data: ligne, error } = await supabase
    .from("nettoyages_stickers_slideshows")
    .select("contenu_id, titre, statut, avant")
    .eq("nettoyage_id", nettoyageId)
    .eq("contenu_id", contenuId)
    .maybeSingle();
  if (error) throw error;
  if (!ligne) return json({ error: "Slideshow introuvable dans ce nettoyage" }, 404);
  const titre = titreCourt(ligne.titre, contenuId);

  if (ligne.statut === "pub") {
    const { data, error: e } = await supabase
      .from("nettoyages_stickers_slideshows")
      .update({ statut: "repeche", maj_at: new Date().toISOString() })
      .eq("nettoyage_id", nettoyageId)
      .eq("contenu_id", contenuId)
      .eq("statut", "pub")
      .select("contenu_id");
    if (e) throw e;
    if ((data ?? []).length === 0) return json({ error: "Retrait en cours sur ce slideshow, réessaie" }, 409);
    await journal(supabase, nettoyageId, `↩ repêché : ${titre}`);
    return json({ ok: true, statut: "repeche" });
  }

  if (ligne.statut === "retire") {
    const avant = (ligne.avant ?? {}) as Record<string, unknown>;
    // Seulement s'il est encore rejeté PAR le nettoyage : un rejet venu
    // d'ailleurs depuis (ELO, révocation) n'est pas défait ici.
    const { data: remis, error: e } = await supabase
      .from("contenus")
      .update({
        statut: "valide",
        import_etape: avant.import_etape ?? "done",
        import_erreur: avant.import_erreur ?? null,
        pertinence_raison: avant.pertinence_raison ?? null,
      })
      .eq("id", contenuId)
      .eq("statut", "rejete")
      .eq("import_etape", "sticker")
      .select("id");
    if (e) throw e;
    if ((remis ?? []).length === 0) {
      return json({ error: "Plus rejeté par le nettoyage (son statut a changé depuis) : rien à repêcher" }, 409);
    }
    const { error: e2 } = await supabase
      .from("nettoyages_stickers_slideshows")
      .update({ statut: "repeche", maj_at: new Date().toISOString() })
      .eq("nettoyage_id", nettoyageId)
      .eq("contenu_id", contenuId);
    if (e2) throw e2;
    await journal(supabase, nettoyageId, `↩ repêché, remis en valide : ${titre}`);
    return json({ ok: true, statut: "repeche" });
  }

  return json({ error: `Pas repêchable (${ligne.statut})` }, 409);
}

async function rejeter(supabase: Client, nettoyageId: string, contenuId: string) {
  const { data: tache, error } = await supabase
    .from("nettoyages_stickers")
    .select("statut")
    .eq("id", nettoyageId)
    .maybeSingle();
  if (error) throw error;
  if (tache?.statut !== "a_confirmer") return json({ error: "Seulement avant le retrait" }, 409);
  const { data, error: e } = await supabase
    .from("nettoyages_stickers_slideshows")
    .update({ statut: "pub", maj_at: new Date().toISOString() })
    .eq("nettoyage_id", nettoyageId)
    .eq("contenu_id", contenuId)
    .eq("statut", "repeche")
    .is("avant", null)
    .select("titre");
  if (e) throw e;
  if ((data ?? []).length === 0) return json({ error: "Pas un repêché de cette liste" }, 409);
  await journal(supabase, nettoyageId, `✗ remis dans la liste à jeter : ${titreCourt(data![0].titre, contenuId)}`);
  return json({ ok: true, statut: "pub" });
}

async function annuler(supabase: Client, nettoyageId: string) {
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase
    .from("nettoyages_stickers")
    .update({ statut: "annule", maj_at: maintenant, fini_at: maintenant })
    .eq("id", nettoyageId)
    .in("statut", ["scan", "a_confirmer"])
    .select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) return json({ error: "Rien à arrêter (retrait lancé, ou déjà fini)" }, 409);
  await journal(supabase, nettoyageId, "Arrêté à la main : rien n'a été jeté.");
  return json({ ok: true });
}

Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;

  let corps: { action?: string; labelId?: string; nettoyageId?: string; contenuId?: string } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide : passage du cron
  }

  try {
    const supabase = serviceClient();
    const action = corps.action ?? "drainer";
    if (action === "drainer") return json(await drainer(supabase));
    if (action === "lancer") {
      if (!corps.labelId) return json({ error: "labelId requis" }, 400);
      const creePar = /^[0-9a-f-]{36}$/i.test(acces.userId) ? acces.userId : null;
      return await lancer(supabase, corps.labelId, creePar);
    }
    if (!corps.nettoyageId) return json({ error: "nettoyageId requis" }, 400);
    if (action === "confirmer") return await confirmer(supabase, corps.nettoyageId);
    if (action === "annuler") return await annuler(supabase, corps.nettoyageId);
    if (action === "repecher" || action === "rejeter") {
      if (!corps.contenuId) return json({ error: "contenuId requis" }, 400);
      return action === "repecher"
        ? await repecher(supabase, corps.nettoyageId, corps.contenuId)
        : await rejeter(supabase, corps.nettoyageId, corps.contenuId);
    }
    return json({ error: "action inconnue (drainer | lancer | confirmer | repecher | rejeter | annuler)" }, 400);
  } catch (error) {
    return json({ error: messageErreur(error) }, 500);
  }
});
