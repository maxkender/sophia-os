/**
 * Relecture automatique des posts publiés : drain de la file `relectures_auto`.
 *
 * Compare la mise en forme du texte retapé par le créateur à celle de
 * l'original (justification, taille, titre / corps, alignement, style), plus
 * le nombre de slides et le son. Écrit les défauts et un brouillon de review
 * (au plus deux points, rédigés puis reformulés par Gemini). N'ENVOIE RIEN au
 * créateur.
 *
 *   {}                                              → un passage de drain
 *   { enfiler: { jour?, limite?, aleatoire? } }     → met un lot de test en file, puis draine
 *   { relire: { post_id } }                         → relit ce post tout de suite (bouton
 *                                                     « Tester » de la file de reviews) et
 *                                                     renvoie sa relecture ; à rappeler tant
 *                                                     qu'elle n'est pas finie
 *   { rejuger: { jour } | { post_ids } }            → réapplique les règles aux mesures
 *                                                     déjà stockées (après un changement de
 *                                                     seuil), sans nouveau scrape ni mesure
 *
 * Déclenché par le cron `relecture-drain` (toutes les 2 min, 01:00-05:58 UTC) ;
 * la file est remplie par `relecture-enfiler` (01:00 UTC, posts de la veille).
 * Trois étapes, chacune reprise au passage suivant si le temps manque :
 *   1. lancer un run Apify pour les posts en attente (un run pour 40 posts) ;
 *   2. relever les runs terminés : slides publiées, son, légende ;
 *   3. mesurer (Gemini, original et publié dans le même appel) puis juger avec
 *      les règles de `_shared/relecture.ts`.
 */

import { downloadMedia } from "../_shared/apify.ts";
import { callWithFallback, generateTextFast, type Part, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import { dimensionsImage } from "../_shared/inpaint.ts";
import {
  agreger,
  choisirPositions,
  controlesPost,
  idMusique,
  type JugementPaire,
  jugerPaire,
  type MesureSlide,
  normaliserBlocs,
  parserMesure,
  PROMPT_MESURE,
  PROMPT_TON,
  redigerBrouillon,
  reformulationValide,
  type RemarqueType,
  trier,
} from "../_shared/relecture.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Client = ReturnType<typeof serviceClient>;

const ACTEUR = "clockworks~tiktok-scraper";
const APIFY = "https://api.apify.com/v2";
/** Posts par run Apify : un run est facturé au résultat, son démarrage coûte du temps. */
const LOT_SCRAPE = 40;
/** Au-delà, la ligne passe en échec (réservations cumulées, scrape + analyse). */
const MAX_TENTATIVES = 5;
/** Un run Apify encore en cours après ce délai est abandonné et relancé. */
const RUN_PERIME_MS = 20 * 60 * 1000;
/**
 * On ne commence plus d'analyse au-delà. La passerelle coupe l'appel à 150 s
 * (504) et tue la fonction avec : une paire d'analyses (jusqu'à ~60 s) lancée
 * plus tard mourrait en route, et ses posts resteraient « analyse » 15 min.
 */
const BUDGET_MS = 75_000;

interface LigneRelecture {
  id: string;
  passage_id: string;
  compte_id: string | null;
  publie_url: string;
  tentatives: number;
  reserve_at: string | null;
  apify_run_id: string | null;
  slides_publiees: unknown;
  musique_publiee_id: string | null;
  /** Vues TikTok relevées au scrape (null avant). */
  vues?: number | null;
}

interface ItemApify {
  id?: string;
  text?: string;
  isSlideshow?: boolean;
  slideshowImageLinks?: Array<string | { downloadLink?: string; tiktokLink?: string }>;
  musicMeta?: { musicId?: string };
  playCount?: number;
}

/** Les vues les plus fraîches connues : TikTok au scrape ou le relevé de l'OS (`passages.vues`). */
function plusDeVues(...valeurs: unknown[]): number | null {
  const nombres = valeurs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nombres.length ? Math.max(...nombres) : null;
}

function jetonApify(): string {
  const jeton = Deno.env.get("APIFY_TOKEN");
  if (!jeton) throw new Error("APIFY_TOKEN manquant");
  return jeton;
}

/** Appels asynchrones (run, statut, dataset) : un scrape de 40 posts ne tient pas dans un run-sync. */
async function apify<T>(chemin: string, corps?: unknown): Promise<T> {
  const sep = chemin.includes("?") ? "&" : "?";
  const reponse = await fetch(
    `${APIFY}${chemin}${sep}token=${jetonApify()}`,
    corps === undefined ? {} : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    },
  );
  if (!reponse.ok) throw new Error(`Apify ${reponse.status}: ${(await reponse.text()).slice(0, 200)}`);
  return (await reponse.json()) as T;
}

/** ID numérique du post : `webVideoUrl` revient en /video/ même pour un post photo. */
function idPost(url: string): string | null {
  return url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** Lien « Partager » de l'app (vm / vt / t) : il ne contient pas l'ID du post. */
function estLienCourt(url: string): boolean {
  return /\/\/(?:vm|vt)\.tiktok\.com\//i.test(url) || /tiktok\.com\/t\//i.test(url);
}

/** Suit la redirection d'un lien court jusqu'au lien complet du post ; les autres liens sont rendus tels quels. */
async function lienCanonique(url: string): Promise<string> {
  const brut = url.trim();
  if (!estLienCourt(brut)) return brut;
  try {
    const reponse = await fetch(brut, { redirect: "follow", headers: { "user-agent": UA } });
    await reponse.body?.cancel();
    return reponse.url || brut;
  } catch {
    return brut;
  }
}

/**
 * Autres posts du même compte (30 derniers jours) dont le lien mène au même
 * TikTok. Un créateur qui colle deux fois le même lien : impossible de savoir
 * quel slideshow ce TikTok montre, on ne juge pas (cas asya.ogrenir761 et
 * mia.thrives282 du 15/10).
 */
async function autresPostsMemeTiktok(
  supabase: Client,
  ligne: { passage_id: string; compte_id: string | null; publie_url: string },
): Promise<number> {
  const id = idPost(ligne.publie_url);
  if (!id || !ligne.compte_id) return 0;
  const { data, error } = await supabase
    .from("passages")
    .select("id, publie_url")
    .eq("compte_id", ligne.compte_id)
    .neq("id", ligne.passage_id)
    .not("publie_url", "is", null)
    .gte("publie_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  if (error) throw error;
  const ids = await Promise.all(
    (data ?? []).map(async (p) => {
      const url = String(p.publie_url ?? "");
      return idPost(url) ?? (estLienCourt(url) ? idPost(await lienCanonique(url)) : null);
    }),
  );
  return ids.filter((autre) => autre === id).length;
}

function erreurDoublon(n: number): string {
  return `même TikTok collé pour ${n + 1} posts de ce compte : impossible de savoir quel slideshow il montre`;
}

async function reserver(
  supabase: Client,
  de: string,
  vers: string,
  n: number,
  reprendre: boolean,
): Promise<LigneRelecture[]> {
  const { data, error } = await supabase.rpc("relecture_reserver", {
    p_de: de,
    p_vers: vers,
    p_n: n,
    p_reprendre: reprendre,
  });
  if (error) throw error;
  return (data ?? []) as LigneRelecture[];
}

async function maj(supabase: Client, ids: string[], champs: Record<string, unknown>) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("relectures_auto")
    .update({ ...champs, maj_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 1. Lancer les scrapes
// ---------------------------------------------------------------------------

/** Un run Apify asynchrone pour ces posts : slides téléchargées, son, légende. */
async function lancerRun(urls: string[]): Promise<string> {
  const run = await apify<{ data: { id: string } }>(`/acts/${ACTEUR}/runs`, {
    postURLs: urls,
    resultsPerPage: 1,
    shouldDownloadSlideshowImages: true,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    proxyCountryCode: "None",
  });
  return run.data.id;
}

async function lancerScrapes(supabase: Client): Promise<number> {
  const lot = await reserver(supabase, "a_scraper", "scrape", LOT_SCRAPE, false);
  const usees = lot.filter((l) => l.tentatives > MAX_TENTATIVES);
  await maj(supabase, usees.map((l) => l.id), { statut: "echec", erreur: "trop de tentatives de scrape" });
  const aLancer = lot.filter((l) => l.tentatives <= MAX_TENTATIVES);
  if (aLancer.length === 0) return 0;
  const ids = aLancer.map((l) => l.id);
  try {
    const runId = await lancerRun(aLancer.map((l) => l.publie_url));
    await maj(supabase, ids, { apify_run_id: runId, erreur: null });
    return aLancer.length;
  } catch (error) {
    await maj(supabase, ids, { statut: "a_scraper", erreur: `lancement Apify : ${messageErreur(error)}` });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 2. Relever les runs terminés
// ---------------------------------------------------------------------------

function liensImages(item: ItemApify): string[] {
  return (item.slideshowImageLinks ?? [])
    .map((l) => (typeof l === "string" ? l : l.downloadLink ?? l.tiktokLink ?? null))
    .filter((u): u is string => Boolean(u));
}

async function releverScrapes(supabase: Client): Promise<number> {
  const { data, error } = await supabase
    .from("relectures_auto")
    .select("id, publie_url, apify_run_id, reserve_at, tentatives")
    .eq("statut", "scrape")
    .limit(400);
  if (error) throw error;
  const lignes = (data ?? []) as LigneRelecture[];

  // Réservée mais run jamais lancé (passage mort entre les deux) : on remet en file.
  const orphelines = lignes.filter(
    (l) => !l.apify_run_id && Date.parse(l.reserve_at ?? "") < Date.now() - 15 * 60 * 1000,
  );
  await maj(supabase, orphelines.map((l) => l.id), { statut: "a_scraper" });

  const parRun = new Map<string, LigneRelecture[]>();
  for (const l of lignes) {
    if (!l.apify_run_id) continue;
    parRun.set(l.apify_run_id, [...(parRun.get(l.apify_run_id) ?? []), l]);
  }

  let releves = 0;
  for (const [runId, groupe] of parRun) releves += await releverRun(supabase, runId, groupe);
  return releves;
}

/**
 * Un run terminé : chaque post passe à analyser (slides publiées en main), ou
 * sort de la file s'il est introuvable ou publié en vidéo. Un run encore en
 * cours est laissé tel quel, sauf s'il traîne depuis trop longtemps.
 */
async function releverRun(supabase: Client, runId: string, groupe: LigneRelecture[]): Promise<number> {
  const ids = groupe.map((l) => l.id);
  const run = (await apify<{ data: { status: string; defaultDatasetId: string } }>(`/actor-runs/${runId}`)).data;
  if (run.status === "READY" || run.status === "RUNNING") {
    const lance = Math.min(...groupe.map((l) => Date.parse(l.reserve_at ?? "") || Date.now()));
    if (Date.now() - lance > RUN_PERIME_MS) {
      await maj(supabase, ids, { statut: "a_scraper", apify_run_id: null, erreur: `run Apify ${runId} trop long` });
    }
    return 0;
  }
  if (run.status !== "SUCCEEDED") {
    await maj(supabase, ids, { statut: "a_scraper", apify_run_id: null, erreur: `run Apify ${runId} : ${run.status}` });
    return 0;
  }

  const items = await apify<ItemApify[]>(`/datasets/${run.defaultDatasetId}/items?clean=true`);
  const parId = new Map(items.filter((i) => i.id).map((i) => [String(i.id), i]));
  let releves = 0;
  for (const l of groupe) {
    const item = parId.get(idPost(l.publie_url) ?? "");
    if (!item) {
      await maj(supabase, [l.id], { statut: "echec", erreur: "post introuvable sur TikTok (supprimé ou privé ?)" });
      continue;
    }
    const images = liensImages(item);
    if (!item.isSlideshow || images.length === 0) {
      await maj(supabase, [l.id], {
        statut: "ignore",
        erreur: "publié en vidéo, pas en diaporama : rien à comparer slide par slide",
        legende: item.text ?? null,
        musique_publiee_id: item.musicMeta?.musicId ?? null,
        vues: item.playCount ?? null,
      });
      continue;
    }
    await maj(supabase, [l.id], {
      statut: "a_analyser",
      slides_publiees: images,
      musique_publiee_id: item.musicMeta?.musicId ?? null,
      legende: item.text ?? null,
      vues: item.playCount ?? null,
      erreur: null,
    });
    releves += 1;
  }
  return releves;
}

// ---------------------------------------------------------------------------
// 3. Mesurer et juger
// ---------------------------------------------------------------------------

function mimeDe(octets: Uint8Array): string {
  if (octets[0] === 0x89 && octets[1] === 0x50) return "image/png";
  if (octets[0] === 0x52 && octets[1] === 0x49 && octets[8] === 0x57) return "image/webp";
  return "image/jpeg";
}

async function chargerImage(url: string): Promise<{ part: Part; largeur: number; hauteur: number }> {
  const octets = await downloadMedia(url);
  const dims = dimensionsImage(octets);
  let binaire = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < octets.length; i += CHUNK) {
    binaire += String.fromCharCode(...octets.subarray(i, i + CHUNK));
  }
  return {
    part: { inline_data: { mime_type: mimeDe(octets), data: btoa(binaire) } },
    // Format inconnu (webp) : 9:16, le format TikTok ; la taille relative reste comparable.
    largeur: dims?.w ?? 1080,
    hauteur: dims?.h ?? 1920,
  };
}

interface SlideTexte {
  position: number;
  texte_overlay?: string | null;
  position_sophia?: boolean;
}

interface SlideStructure {
  position: number;
  raw_url?: string | null;
}

async function mesurerPaire(position: number, urlOriginal: string, urlPublie: string) {
  const [a, b] = await Promise.all([chargerImage(urlOriginal), chargerImage(urlPublie)]);
  const reponse = textOf(
    await callWithFallback(TEXT_MODELS, [
      { text: "Image A — ORIGINAL :" },
      a.part,
      { text: "Image B — PUBLIÉE :" },
      b.part,
      { text: PROMPT_MESURE },
    ]),
  );
  const mesure = parserMesure(reponse);
  if (!mesure) throw new Error(`slide ${position} : réponse Gemini illisible`);
  const original: MesureSlide = { blocs: mesure.a, largeurPx: a.largeur, hauteurPx: a.hauteur };
  const publie: MesureSlide = { blocs: mesure.b, largeurPx: b.largeur, hauteurPx: b.hauteur };
  return { position, original, publie, policeIdentique: mesure.policeIdentique };
}

/** Le brouillon déterministe dit juste ; Gemini le rend plus humain. En cas de doute, on garde le brouillon. */
async function reformuler(brouillon: string): Promise<string> {
  if (!brouillon) return brouillon;
  try {
    const brut = (await generateTextFast(`${PROMPT_TON}${brouillon}`)).trim();
    const texte = brut.replace(/^```(?:\w+)?\n?/, "").replace(/\n?```$/, "").trim();
    return reformulationValide(brouillon, texte) ? texte : brouillon;
  } catch {
    return brouillon;
  }
}

async function analyserLigne(
  supabase: Client,
  ligne: LigneRelecture,
  remarquesTypes: RemarqueType[],
): Promise<"fait" | "ignore" | "reessai" | "echec"> {
  try {
    const doublons = await autresPostsMemeTiktok(supabase, ligne);
    if (doublons > 0) {
      await maj(supabase, [ligne.id], { statut: "ignore", erreur: erreurDoublon(doublons), analyse_at: new Date().toISOString() });
      return "ignore";
    }

    const { data: passage, error } = await supabase
      .from("passages")
      .select("slides, musique_url, vues, contenus(structure_slides)")
      .eq("id", ligne.passage_id)
      .single();
    if (error) throw error;

    const slides = ((passage.slides ?? []) as SlideTexte[]).sort((p, q) => p.position - q.position);
    const contenu = Array.isArray(passage.contenus) ? passage.contenus[0] : passage.contenus;
    const structure = ((contenu as { structure_slides?: SlideStructure[] } | null)?.structure_slides ?? []);
    const brutDe = new Map(structure.map((s) => [s.position, s.raw_url?.trim() || null]));
    const publiees = (Array.isArray(ligne.slides_publiees) ? ligne.slides_publiees : []) as string[];

    const candidates = slides
      .filter((s) => !s.position_sophia && (s.texte_overlay ?? "").trim() && brutDe.get(s.position) && publiees[s.position - 1])
      .map((s) => ({ position: s.position, longueur: (s.texte_overlay ?? "").trim().length }));
    const positions = choisirPositions(candidates);

    const controles = controlesPost({
      slidesAttendues: slides.length,
      slidesPubliees: publiees.length,
      musiqueAttendueId: idMusique(passage.musique_url as string | null),
      musiquePublieeId: ligne.musique_publiee_id,
    });

    if (positions.length === 0) {
      await maj(supabase, [ligne.id], {
        statut: "ignore",
        erreur: "aucune slide comparable (original sans image brute)",
        defauts: controles,
        analyse_at: new Date().toISOString(),
      });
      return "ignore";
    }

    const resultats = await Promise.allSettled(
      positions.map((p) => mesurerPaire(p, brutDe.get(p)!, publiees[p - 1])),
    );
    const jugements: JugementPaire[] = [];
    const comparaisons: unknown[] = [];
    const echecs: string[] = [];
    for (const r of resultats) {
      if (r.status === "rejected") {
        echecs.push(messageErreur(r.reason));
        continue;
      }
      const j = jugerPaire(r.value.position, r.value.original, r.value.publie, r.value.policeIdentique);
      jugements.push(j);
      comparaisons.push({
        position: r.value.position,
        original: r.value.original,
        publie: r.value.publie,
        police_identique: r.value.policeIdentique,
        constats: j.constats,
      });
    }
    if (jugements.length === 0) throw new Error(echecs.join(" | ") || "aucune mesure");

    // Du plus important au moins important : la file de reviews montre les premiers comme points de la review.
    const defauts = trier([...agreger(jugements), ...controles]);
    const vues = plusDeVues(ligne.vues, passage.vues);
    const brouillon = redigerBrouillon(defauts, remarquesTypes, { vues });
    await maj(supabase, [ligne.id], {
      statut: "fait",
      comparaisons,
      defauts,
      vues,
      // Le bravo d'un post qui marche part tel quel.
      brouillon: (brouillon.bravo ? brouillon.texte : await reformuler(brouillon.texte)) || null,
      remarques: brouillon.remarques,
      erreur: echecs.length ? `mesures partielles : ${echecs.join(" | ").slice(0, 500)}` : null,
      analyse_at: new Date().toISOString(),
    });
    return "fait";
  } catch (error) {
    const fin = ligne.tentatives >= MAX_TENTATIVES;
    await maj(supabase, [ligne.id], {
      statut: fin ? "echec" : "a_analyser",
      erreur: messageErreur(error).slice(0, 800),
    });
    return fin ? "echec" : "reessai";
  }
}

// ---------------------------------------------------------------------------
// Rejuger : les règles changent, les mesures restent
// ---------------------------------------------------------------------------

interface ComparaisonStockee {
  position: number;
  original: { blocs?: unknown; largeurPx?: number; hauteurPx?: number };
  publie: { blocs?: unknown; largeurPx?: number; hauteurPx?: number };
  police_identique?: boolean | null;
}

function mesureStockee(m: ComparaisonStockee["original"]): MesureSlide {
  return { blocs: normaliserBlocs(m?.blocs), largeurPx: Number(m?.largeurPx) || 1080, hauteurPx: Number(m?.hauteurPx) || 1920 };
}

/** Réapplique les règles aux mesures stockées : défauts, brouillon et remarques à jour, sans appel à Apify. */
async function rejugerLigne(
  supabase: Client,
  ligne: { id: string; passage_id: string; comparaisons: unknown; defauts: unknown; vues: number | null },
  remarquesTypes: RemarqueType[],
): Promise<string[]> {
  const comparaisons = (Array.isArray(ligne.comparaisons) ? ligne.comparaisons : []) as ComparaisonStockee[];
  const jugements = comparaisons.map((c) =>
    jugerPaire(c.position, mesureStockee(c.original), mesureStockee(c.publie), c.police_identique ?? null)
  );
  // Nombre de slides et son ne dépendent pas des mesures : on garde ceux de la relecture.
  const controles = ((Array.isArray(ligne.defauts) ? ligne.defauts : []) as Array<Record<string, unknown>>)
    .filter((d) => d.code === "nb_slides" || d.code === "musique")
    .map((d) => ({ ...d, niveau: "remarque" })) as unknown as ReturnType<typeof controlesPost>;
  const defauts = trier([...agreger(jugements), ...controles]);
  const { data: passage } = await supabase.from("passages").select("vues").eq("id", ligne.passage_id).maybeSingle();
  const vues = plusDeVues(ligne.vues, passage?.vues);
  const brouillon = redigerBrouillon(defauts, remarquesTypes, { vues });
  await maj(supabase, [ligne.id], {
    comparaisons: comparaisons.map((c, i) => ({ ...c, constats: jugements[i].constats })),
    defauts,
    vues,
    brouillon: (brouillon.bravo ? brouillon.texte : await reformuler(brouillon.texte)) || null,
    remarques: brouillon.remarques,
  });
  return defauts.map((d) => d.code);
}

async function rejuger(
  supabase: Client,
  cible: { jour?: unknown; post_ids?: unknown },
  remarquesTypes: RemarqueType[],
): Promise<Array<{ post_id: string; defauts: string[] }>> {
  let requete = supabase
    .from("relectures_auto")
    .select("id, post_id, passage_id, comparaisons, defauts, vues")
    .eq("statut", "fait")
    .limit(60);
  if (Array.isArray(cible.post_ids)) requete = requete.in("post_id", cible.post_ids.map(String));
  else if (typeof cible.jour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cible.jour)) requete = requete.eq("jour", cible.jour);
  else throw new Error("rejuger : jour (AAAA-MM-JJ) ou post_ids attendus");
  const { data, error } = await requete;
  if (error) throw error;
  const lignes = (data ?? []) as Array<{
    id: string;
    post_id: string;
    passage_id: string;
    comparaisons: unknown;
    defauts: unknown;
    vues: number | null;
  }>;
  const bilan: Array<{ post_id: string; defauts: string[] }> = [];
  for (let i = 0; i < lignes.length; i += 4) {
    const lot = lignes.slice(i, i + 4);
    const codes = await Promise.all(lot.map((l) => rejugerLigne(supabase, l, remarquesTypes)));
    lot.forEach((l, k) => bilan.push({ post_id: l.post_id, defauts: codes[k] }));
  }
  return bilan;
}

// ---------------------------------------------------------------------------
// Relecture d'un seul post, à la demande (bouton « Tester » de la file)
// ---------------------------------------------------------------------------

/** On attend le scrape au plus autant dans un appel ; au-delà, le navigateur rappelle. */
const ATTENTE_SCRAPE_MS = 70_000;
/** Une analyse lancée il y a moins longtemps est encore en cours (double clic, cron). */
const ANALYSE_EN_COURS_MS = 3 * 60 * 1000;

const COLONNES_LIGNE =
  "id, passage_id, compte_id, post_id, publie_url, statut, tentatives, reserve_at, apify_run_id, slides_publiees, " +
  "musique_publiee_id, vues, defauts, brouillon, remarques, erreur";

type LigneComplete = LigneRelecture & {
  post_id: string;
  statut: string;
  defauts: unknown;
  brouillon: string | null;
  remarques: unknown;
  erreur: string | null;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jourParis(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Number.isNaN(d.getTime()) ? new Date() : d);
}

async function lireLigne(supabase: Client, postId: string): Promise<LigneComplete | null> {
  const { data, error } = await supabase.from("relectures_auto").select(COLONNES_LIGNE).eq("post_id", postId).maybeSingle();
  if (error) throw error;
  return (data as LigneComplete | null) ?? null;
}

/** Met le post en file s'il n'y est pas (même sélection que `relecture_enfiler`, pour un seul post). */
async function ligneDuPost(supabase: Client, postId: string): Promise<LigneComplete> {
  const existante = await lireLigne(supabase, postId);
  if (existante) return existante;
  const { data: passage, error } = await supabase
    .from("passages")
    .select("id, post_id, compte_id, publie_url, publie_at, comptes(poster_id), posts(publie_url, publie_at)")
    .eq("post_id", postId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!passage) throw new Error("pas de slideshow assigné pour ce post : rien à comparer");
  const compte = (Array.isArray(passage.comptes) ? passage.comptes[0] : passage.comptes) as { poster_id?: string } | null;
  const post = (Array.isArray(passage.posts) ? passage.posts[0] : passage.posts) as
    | { publie_url?: string | null; publie_at?: string | null }
    | null;
  // Lien court (« Partager » de l'app) : on suit la redirection pour avoir l'ID du post.
  const url = await lienCanonique((passage.publie_url as string | null) || post?.publie_url || "");
  if (!idPost(url)) throw new Error("le lien collé par le créateur ne mène pas à un post TikTok");
  const { error: errInsert } = await supabase.from("relectures_auto").insert({
    passage_id: passage.id,
    post_id: postId,
    compte_id: passage.compte_id,
    poster_id: compte?.poster_id ?? null,
    jour: jourParis((passage.publie_at as string | null) ?? post?.publie_at ?? null),
    publie_url: url,
    origine: "test",
  });
  // Un autre appel vient de l'insérer : on reprend la sienne.
  if (errInsert && errInsert.code !== "23505") throw errInsert;
  const ligne = await lireLigne(supabase, postId);
  if (!ligne) throw new Error("mise en file impossible");
  return ligne;
}

/**
 * Fait avancer la relecture de ce post aussi loin que possible dans cet appel :
 * scrape (attendu jusqu'à ATTENTE_SCRAPE_MS), puis mesure et jugement. Une
 * relecture déjà finie est renvoyée telle quelle ; un échec est retenté.
 */
async function relireMaintenant(
  supabase: Client,
  postId: string,
  remarquesTypes: () => Promise<RemarqueType[]>,
): Promise<LigneComplete> {
  const debut = Date.now();
  let ligne = await ligneDuPost(supabase, postId);

  if (ligne.statut === "echec") {
    const scrape = Array.isArray(ligne.slides_publiees) && ligne.slides_publiees.length > 0;
    await maj(supabase, [ligne.id], { statut: scrape ? "a_analyser" : "a_scraper", tentatives: 0, apify_run_id: null, erreur: null });
    ligne = (await lireLigne(supabase, postId))!;
  }

  if (ligne.statut === "a_scraper" || (ligne.statut === "scrape" && !ligne.apify_run_id)) {
    const doublons = await autresPostsMemeTiktok(supabase, ligne);
    if (doublons > 0) {
      await maj(supabase, [ligne.id], { statut: "ignore", erreur: erreurDoublon(doublons), analyse_at: new Date().toISOString() });
      return (await lireLigne(supabase, postId))!;
    }
    const runId = await lancerRun([ligne.publie_url]);
    await maj(supabase, [ligne.id], {
      statut: "scrape",
      apify_run_id: runId,
      reserve_at: new Date().toISOString(),
      tentatives: ligne.tentatives + 1,
      erreur: null,
    });
    ligne = (await lireLigne(supabase, postId))!;
  }

  while (ligne.statut === "scrape" && ligne.apify_run_id) {
    await releverRun(supabase, ligne.apify_run_id, [ligne]);
    ligne = (await lireLigne(supabase, postId))!;
    if (ligne.statut !== "scrape" || Date.now() - debut > ATTENTE_SCRAPE_MS) break;
    await pause(4000);
  }

  const analyseFigee = ligne.statut === "analyse" &&
    Date.now() - (Date.parse(ligne.reserve_at ?? "") || 0) > ANALYSE_EN_COURS_MS;
  if (ligne.statut === "a_analyser" || analyseFigee) {
    await maj(supabase, [ligne.id], {
      statut: "analyse",
      reserve_at: new Date().toISOString(),
      tentatives: ligne.tentatives + 1,
    });
    await analyserLigne(supabase, { ...ligne, tentatives: ligne.tentatives + 1 }, await remarquesTypes());
    ligne = (await lireLigne(supabase, postId))!;
  }
  return ligne;
}

// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: {
    enfiler?: { jour?: unknown; limite?: unknown; aleatoire?: unknown };
    relire?: { post_id?: unknown };
    rejuger?: { jour?: unknown; post_ids?: unknown };
  } = {};
  try {
    corps = (await request.json()) ?? {};
  } catch {
    // corps vide : un passage de drain
  }

  const debut = Date.now();
  const supabase = serviceClient();
  const remarquesTypes = async () => {
    const { data } = await supabase.from("review_remarques").select("id, titre, corps, video_url");
    return (data ?? []) as RemarqueType[];
  };

  if (corps.rejuger) {
    try {
      const bilan = await rejuger(supabase, corps.rejuger, await remarquesTypes());
      return json({ ok: true, rejuges: bilan.length, bilan, duree_ms: Date.now() - debut });
    } catch (error) {
      return json({ ok: false, error: messageErreur(error) }, 500);
    }
  }

  if (corps.relire) {
    const postId = String(corps.relire.post_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(postId)) return json({ error: "post_id attendu" }, 400);
    try {
      const ligne = await relireMaintenant(supabase, postId, remarquesTypes);
      return json({
        ok: true,
        relecture: {
          post_id: ligne.post_id,
          statut: ligne.statut,
          defauts: ligne.defauts,
          brouillon: ligne.brouillon,
          remarques: ligne.remarques,
          erreur: ligne.erreur,
          vues: ligne.vues ?? null,
        },
      });
    } catch (error) {
      return json({ ok: false, error: messageErreur(error) }, 500);
    }
  }
  const bilan = { enfiles: 0, scrapesLances: 0, releves: 0, faits: 0, ignores: 0, reessais: 0, echecs: 0, erreurs: [] as string[] };

  try {
    if (corps.enfiler) {
      const jour = String(corps.enfiler.jour ?? aujourdhuiParis());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return json({ error: "jour attendu au format AAAA-MM-JJ" }, 400);
      const limite = Math.min(50, Math.max(1, Number(corps.enfiler.limite ?? 10) || 10));
      const { data, error } = await supabase.rpc("relecture_enfiler", {
        p_jour: jour,
        p_limite: limite,
        p_aleatoire: corps.enfiler.aleatoire !== false,
        p_origine: "test",
      });
      if (error) throw error;
      bilan.enfiles = Number(data) || 0;
    }

    for (const etape of [
      async () => (bilan.scrapesLances = await lancerScrapes(supabase)),
      async () => (bilan.releves = await releverScrapes(supabase)),
    ]) {
      try {
        await etape();
      } catch (error) {
        bilan.erreurs.push(messageErreur(error));
      }
    }

    const types = await remarquesTypes();
    while (Date.now() - debut < BUDGET_MS) {
      const lot = await reserver(supabase, "a_analyser", "analyse", 2, true);
      if (lot.length === 0) break;
      const issues = await Promise.all(lot.map((l) => analyserLigne(supabase, l, types)));
      for (const issue of issues) {
        if (issue === "fait") bilan.faits += 1;
        else if (issue === "ignore") bilan.ignores += 1;
        else if (issue === "reessai") bilan.reessais += 1;
        else bilan.echecs += 1;
      }
    }

    if (bilan.enfiles + bilan.scrapesLances + bilan.releves + bilan.faits + bilan.ignores + bilan.reessais + bilan.echecs > 0) {
      console.log(
        `[relecture-auto] ${bilan.enfiles} en file · ${bilan.scrapesLances} scrape(s) lancé(s) · ${bilan.releves} relevé(s)` +
          ` · ${bilan.faits} relu(s) · ${bilan.ignores} ignoré(s) · ${bilan.reessais} à reprendre · ${bilan.echecs} échec(s)`,
      );
    }
    for (const e of bilan.erreurs) console.log(`[relecture-auto] ERR ${e}`);
    return json({ ok: true, ...bilan, duree_ms: Date.now() - debut });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error), ...bilan }, 500);
  }
});
