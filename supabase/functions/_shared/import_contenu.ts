import {
  downloadImage,
  listerDiaporamas,
  listerPostsProfil,
  normaliserHandleTiktok,
  scrapePost,
  type ScrapedPost,
} from "./apify.ts";
import {
  cleanImage,
  integrateSophia,
  mimeDepuisBase64,
  ocrFrame,
  scoreRelevance,
  translateSlideshow,
} from "./gemini.ts";
import {
  assurerHookMedia,
  captionnerMedia,
  slidesSansCaption,
} from "./media_caption.ts";
import {
  attacherLabelsAuMedia,
  mediaPropreMemeLabel,
} from "./media_labels.ts";
import {
  MAX_TENTATIVES_NETTOYAGE,
  prochainesSlidesANettoyer,
  slidesEpuisees,
  tentativesSlide,
} from "./nettoyage_file.ts";
import {
  incrementerTentativeSlide,
  patchSlideMediaId,
  trouverPropreExistant,
} from "./slide_media.ts";
import {
  estNouveauDepuisImport,
  idPostTiktok,
  maxIdTiktok,
  normaliserCreateTime,
  urlsManquantes,
} from "./import_nouveaux.ts";
import {
  applicationParId,
  applicationSophia,
  clePromptPertinence,
  clePromptPlacement,
  placementParDefaut,
  resoudreApplicationImport,
} from "./applications.ts";
import { lireParLots } from "./lots.ts";
import {
  passagesPourTier,
  tierImport,
  type Tier,
} from "./tierlist.ts";
import { chargerPrompt, messageErreur, serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
export const LANGUES_CIBLES = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "pt",
  "cs",
  "nl",
  "el",
  "hu",
  "pl",
  "ro",
  "sv",
  "tr",
] as const;
const SLIDES_PAR_PASSAGE = 2;
/** Captions Florence/Moondream : plus légères que le nettoyage Fal. */
const SLIDES_CAPTION_PAR_PASSAGE = 2;
/** 1 slide / passage nettoyage : Fal≤90s + store doit tenir sous le mur Edge ~150s. */
const SLIDES_NETTOYAGE_PAR_PASSAGE = 1;
/**
 * Apify `resultsPerPage` pour le listing d'un profil. À 100, un compte qui a
 * publié 150 slideshows n'en révélait que la première tranche : le reste était
 * introuvable, y compris via « Mettre à jour ». Surchargeable sans redéploiement
 * par `IMPORT_LISTING_MAX`.
 */
const SCRAPE_TOUS = Number(Deno.env.get("IMPORT_LISTING_MAX") ?? "") || 600;

/** PostgREST s'arrête à ~1000 lignes sans `range` — il faut paginer explicitement. */
const PAGE_POSTGREST = 1000;

export interface SlideBrut {
  position: number;
  raw_url: string;
  reference_url?: string | null;
  media_id: string | null;
  texte_original?: string | null;
  tentatives?: number;
}

export interface SlideLangue {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}


const idDe = (url: string) => idPostTiktok(url);

async function lireScoring(supabase: Supabase) {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "scoring").maybeSingle();
  const v = (data?.valeur ?? {}) as Record<string, number>;
  return {
    prior: v.score_prior ?? 50,
    /**
     * Régularisation ELO à l'import (≠ regularisation_k des comptes).
     * Faible (1) pour ne pas écraser 1k vs 20k vers le prior.
     */
    k: v.elo_regularisation_k ?? 1,
    pertinence: v.pertinence_seuil ?? 50,
    /** Seuil ELO : en-dessous → langue non cuite ; si aucune langue → pas d'import. */
    eloSeuil: v.elo_seuil_import ?? 55,
    /** Poids des vues dans la note d'import (reste = pertinence). Défaut 70 %. */
    poidsVues: v.elo_poids_vues ?? 0.7,
    /**
     * Plafond des vues → score 100.
     * 80k : meilleure résolution dans la zone 1k–20k.
     */
    vuesPlafond: v.elo_vues_plafond ?? 80_000,
  };
}

/**
 * Score « force » du TikTok à partir des vues (0..100).
 * log^1.3 : plus d'écart entre 1k et 20k qu'un log pur (qui compressait le milieu).
 */
export function scoreDepuisVues(
  vues: number | null | undefined,
  plafond = 80_000,
): number {
  const p = Math.max(1, plafond);
  const exp = 1.3;
  const num = Math.log(1 + (vues ?? 0)) ** exp;
  const den = Math.log(1 + p) ** exp;
  return Math.min(100, Math.max(0, (num / den) * 100));
}

export interface EloLigneDetail {
  langue: string;
  estSource: boolean;
  pertinence: number;
  vuesScore: number;
  base: number;
  kk: number;
  prior: number;
  elo: number;
  seuil: number;
  retenue: boolean;
}

export interface EloRapport {
  vues: number;
  /** Note /100 de la langue source — sert au seul premier placement. */
  elo: number;
  /** Tier d'entrée déduit de la note (null = sous le seuil, pas importé). */
  tier: Tier | null;
  pertinence: number;
  vuesScore: number;
  poidsVues: number;
  vuesPlafond: number;
  prior: number;
  k: number;
  seuil: number;
  langueSource: string;
  lignes: EloLigneDetail[];
  /** Texte multiligne prêt pour les logs d'import. */
  texte: string;
}

/**
 * ELO cold-start par langue :
 *   base = (1−poidsVues)×pertinence + poidsVues×scoreVues   (défaut 10/90)
 *   puis légère régularisation vers le prior (elo_regularisation_k, défaut 1),
 *   avec bonus langue d'origine (k/2 vs 2k).
 */
export function eloParLangue(opts: {
  pertinence: number;
  vues: number | null | undefined;
  langue: string;
  langueSource: string;
  prior: number;
  k: number;
  poidsVues?: number;
  vuesPlafond?: number;
}): number {
  return decomposerElo(opts).elo;
}

/** Décomposition complète d'un ELO (pour logs). */
export function decomposerElo(opts: {
  pertinence: number;
  vues: number | null | undefined;
  langue: string;
  langueSource: string;
  prior: number;
  k: number;
  poidsVues?: number;
  vuesPlafond?: number;
  seuil?: number;
}): EloLigneDetail & { poidsVues: number; vuesPlafond: number; vues: number } {
  const poidsVues = Math.min(1, Math.max(0, opts.poidsVues ?? 0.7));
  const vuesPlafond = opts.vuesPlafond ?? 80_000;
  const vues = opts.vues ?? 0;
  const vuesScore = scoreDepuisVues(vues, vuesPlafond);
  const pertinence = Math.min(100, Math.max(0, opts.pertinence));
  const base = (1 - poidsVues) * pertinence + poidsVues * vuesScore;
  const estSource = opts.langue === opts.langueSource;
  const kk = estSource ? opts.k / 2 : opts.k * 2;
  const elo = (kk * opts.prior + base) / (kk + 1);
  const seuil = opts.seuil ?? 55;
  return {
    langue: opts.langue,
    estSource,
    pertinence,
    vuesScore,
    base,
    kk,
    prior: opts.prior,
    elo,
    seuil,
    retenue: elo >= seuil,
    poidsVues,
    vuesPlafond,
    vues,
  };
}

/**
 * Note d'import — une seule note /100, sur la langue source.
 *
 * Plus de note par langue : le placement d'un contenu se joue ensuite sur son
 * rang de tierlist, langue-agnostique. Cette note ne sert qu'au premier
 * placement (sous le seuil → pas d'import ; sinon C / B / A).
 */
export function rapportEloComplet(opts: {
  pertinence: number;
  vues: number | null | undefined;
  langueSource: string;
  prior: number;
  k: number;
  poidsVues: number;
  vuesPlafond: number;
  seuil: number;
}): EloRapport {
  const head = decomposerElo({
    ...opts,
    langue: opts.langueSource,
    seuil: opts.seuil,
  });
  const tier = tierImport(head.elo, opts.seuil);
  const pctVues = Math.round(opts.poidsVues * 100);
  const pctPert = 100 - pctVues;
  const texte = [
    `vues=${head.vues} → scoreVues=${head.vuesScore.toFixed(2)} (log^1.3, plafond ${opts.vuesPlafond})`,
    `pertinence=${head.pertinence}`,
    `base = ${pctPert}%×pert + ${pctVues}%×vues = ${head.base.toFixed(2)}`,
    `régularisation: prior=${opts.prior} k=${opts.k} · seuil=${opts.seuil} · langue source=${opts.langueSource}`,
    `note = (kk×prior + base) / (kk+1) avec kk=${head.kk} → ${head.elo.toFixed(2)}`,
    tier
      ? `→ premier placement : ${tier} (${passagesPourTier(tier)} passage(s) à effectuer)`
      : `→ sous le seuil (${opts.seuil}) : TikTok non importé`,
  ].join("\n");

  return {
    vues: head.vues,
    elo: head.elo,
    tier,
    pertinence: head.pertinence,
    vuesScore: head.vuesScore,
    poidsVues: opts.poidsVues,
    vuesPlafond: opts.vuesPlafond,
    prior: opts.prior,
    k: opts.k,
    seuil: opts.seuil,
    langueSource: opts.langueSource,
    lignes: [
      (({ poidsVues: _p, vuesPlafond: _v, vues: _u, ...l }) => l)(head),
    ],
    texte,
  };
}

/** Hérite les labels du compte de référence + labels explicites. */
export async function attacherLabels(
  supabase: Supabase,
  contenuId: string,
  compteReferenceId: string | null,
  labelIds: string[] | null,
): Promise<void> {
  const ids = new Set<string>(labelIds ?? []);
  if (compteReferenceId) {
    const { data } = await supabase
      .from("compte_reference_labels")
      .select("label_id")
      .eq("compte_reference_id", compteReferenceId);
    for (const row of data ?? []) ids.add(row.label_id);
  }
  if (ids.size === 0) return;
  await supabase.from("contenu_labels").upsert(
    [...ids].map((label_id) => ({ contenu_id: contenuId, label_id })),
    { onConflict: "contenu_id,label_id" },
  );
}

async function stockerVisuelBrut(
  supabase: Supabase,
  postId: string,
  position: number,
  sourceUrl: string,
): Promise<string> {
  try {
    const bytes = await downloadImage(sourceUrl);
    const path = `brut/${postId}/${position}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return sourceUrl;
  }
}

async function trouverContenuParUrl(
  supabase: Supabase,
  postUrl: string,
  applicationId?: string | null,
): Promise<{ id: string } | null> {
  let exactQ = supabase.from("contenus").select("id").eq("source_url", postUrl);
  if (applicationId) exactQ = exactQ.eq("application_id", applicationId);
  const { data: exact } = await exactQ.maybeSingle();
  if (exact) return exact;

  const pid = idDe(postUrl);
  if (!pid || pid === postUrl) return null;
  // Variantes /photo/ vs /video/ : match sur l'id TikTok.
  let approxQ = supabase
    .from("contenus")
    .select("id, source_url")
    .or(`source_url.ilike.%/photo/${pid}%,source_url.ilike.%/video/${pid}%`)
    .limit(1);
  if (applicationId) approxQ = approxQ.eq("application_id", applicationId);
  const { data: approx } = await approxQ.maybeSingle();
  return approx ? { id: approx.id } : null;
}

async function slidesBrutesDepuisPost(
  supabase: Supabase,
  post: ScrapedPost,
): Promise<SlideBrut[]> {
  const slides: SlideBrut[] = [];
  for (const [index, url] of post.imageUrls.entries()) {
    const position = index + 1;
    const raw = await stockerVisuelBrut(supabase, post.postId, position, url);
    slides.push({
      position,
      raw_url: raw,
      reference_url: raw,
      media_id: null,
      texte_original: null,
    });
  }
  return slides;
}

/**
 * Réouvre un contenu déjà importé pour un nouveau passage pipeline
 * (OCR → ELO → clean → Sophia source). Même id → l'historique Passages / stats
 * reste branché. Les decks `contenu_langues` sont remis à zéro (recalcul ELO).
 */
async function reouvrirContenuPourReimport(
  supabase: Supabase,
  contenuId: string,
  post: ScrapedPost,
  compteReferenceId: string | null,
  labelIds: string[] | null,
  langueSource: string,
  applicationId: string,
): Promise<void> {
  const slides = await slidesBrutesDepuisPost(supabase, post);
  const { error } = await supabase
    .from("contenus")
    .update({
      titre: post.text.slice(0, 160) || "Sans titre",
      structure_slides: slides,
      compte_reference_id: compteReferenceId,
      source_url: post.webVideoUrl,
      langue_source: langueSource,
      application_id: applicationId,
      musique_url: post.musicUrl,
      musique_titre: post.musicTitle,
      vues_source: post.stats?.vues ?? null,
      pertinence_score: null,
      pertinence_raison: null,
      statut: "brouillon",
      import_statut: "pending",
      import_etape: null,
      import_erreur: null,
      import_tentatives: 0,
    })
    .eq("id", contenuId);
  if (error) throw error;

  // Recalcul ELO / decks à l'import — les passages déjà créés gardent leur snapshot.
  await supabase.from("contenu_langues").delete().eq("contenu_id", contenuId);
  await attacherLabels(supabase, contenuId, compteReferenceId, labelIds);
}

async function applicationIdDeSource(
  supabase: Supabase,
  compteReferenceId: string | null,
): Promise<string | null> {
  if (!compteReferenceId) return null;
  const { data, error } = await supabase
    .from("comptes_reference")
    .select("application_id")
    .eq("id", compteReferenceId)
    .maybeSingle();
  if (error) throw error;
  return (data?.application_id as string | undefined) ?? null;
}

/** Source > id explicite > Sophia. Une source sans app refuse l'import. */
async function applicationIdPourImport(
  supabase: Supabase,
  compteReferenceId: string | null,
  explicit: string | null,
): Promise<string> {
  if (compteReferenceId) {
    const fromSource = await applicationIdDeSource(supabase, compteReferenceId);
    if (!fromSource) {
      throw new Error(
        `Source ${compteReferenceId} sans application — import refusé (évite le fallback Sophia)`,
      );
    }
    return fromSource;
  }
  return resoudreApplicationImport({
    explicitApplicationId: explicit,
    fallbackId: (await applicationSophia(supabase)).id,
  });
}

async function slugApplicationDeContenu(
  supabase: Supabase,
  contenu: { application_id?: string | null; compte_reference_id?: string | null },
): Promise<string> {
  const id = contenu.application_id
    ?? await applicationIdDeSource(supabase, contenu.compte_reference_id ?? null);
  const app = await applicationParId(supabase, id);
  return app?.slug ?? "sophia";
}

/** Crée un contenu depuis un post scrapé (idempotent sur source_url). */
export async function creerContenuDepuisPost(
  supabase: Supabase,
  post: ScrapedPost,
  compteReferenceId: string | null,
  labelIds: string[] | null = null,
  langueSource = "fr",
  applicationIdExplicit: string | null = null,
): Promise<{ id: string; reused: boolean }> {
  const applicationId = await applicationIdPourImport(
    supabase,
    compteReferenceId,
    applicationIdExplicit,
  );
  const existant = await trouverContenuParUrl(supabase, post.webVideoUrl, applicationId);
  if (existant) {
    await reouvrirContenuPourReimport(
      supabase,
      existant.id,
      post,
      compteReferenceId,
      labelIds,
      langueSource,
      applicationId,
    );
    return { id: existant.id, reused: true };
  }

  const slides = await slidesBrutesDepuisPost(supabase, post);

  const { data: contenu, error } = await supabase
    .from("contenus")
    .insert({
      titre: post.text.slice(0, 160) || "Sans titre",
      structure_slides: slides,
      compte_reference_id: compteReferenceId,
      source_url: post.webVideoUrl,
      langue_source: langueSource,
      application_id: applicationId,
      musique_url: post.musicUrl,
      musique_titre: post.musicTitle,
      vues_source: post.stats?.vues ?? null,
      statut: "brouillon",
      import_statut: "pending",
      import_etape: null,
      profondeur: 0,
    })
    .select("id")
    .single();
  if (error || !contenu) throw error ?? new Error("Création contenu échouée");

  await attacherLabels(supabase, contenu.id, compteReferenceId, labelIds);
  // Les lignes `contenu_langues` sont créées APRÈS pertinence + gate ELO
  // (uniquement les langues au-dessus du seuil).
  return { id: contenu.id, reused: false };
}

/**
 * Premier placement en tierlist depuis la note /100 de la langue source.
 *
 * Sous le seuil → `null` (TikTok non importé). Sinon le contenu entre en C / B / A
 * avec le nombre de passages du rang, et la ligne `contenu_langues` de la langue
 * source est créée (deck de base pour les traductions ultérieures).
 *
 * Plus de gate par langue : toutes les langues sont postables, leur deck naît à
 * la demande à l'assignation (`assurerDeckPourLangue`).
 */
export async function assurerTierImport(
  supabase: Supabase,
  contenuId: string,
  langueSource: string,
  vuesSource: number | null,
  pertinence: number,
): Promise<Tier | null> {
  const scoring = await lireScoring(supabase);
  const elo = eloParLangue({
    pertinence,
    vues: vuesSource,
    langue: langueSource,
    langueSource,
    prior: scoring.prior,
    k: scoring.k,
    poidsVues: scoring.poidsVues,
    vuesPlafond: scoring.vuesPlafond,
  });
  const tier = tierImport(elo, scoring.eloSeuil);
  if (!tier) return null;

  // Ligne langue source : deck OCR + base de traduction. `score` reste renseigné
  // pour l'historique, il ne pilote plus le placement.
  const { data: existante } = await supabase
    .from("contenu_langues")
    .select("id")
    .eq("contenu_id", contenuId)
    .eq("langue", langueSource)
    .maybeSingle();
  if (!existante) {
    const { error } = await supabase.from("contenu_langues").insert({
      contenu_id: contenuId,
      langue: langueSource,
      slides: [] as SlideLangue[],
      score: elo,
      nb_passages: 0,
      score_maj_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  // Ne pas réécraser le rang d'un contenu déjà requalifié (réimport / reprise).
  const { data: courant } = await supabase
    .from("contenus")
    .select("tier_maj_at")
    .eq("id", contenuId)
    .maybeSingle();
  if (!courant?.tier_maj_at) {
    const { error: errT } = await supabase
      .from("contenus")
      .update({
        tier,
        passages_prevus: passagesPourTier(tier),
        tier_cycle: 0,
        tier_maj_at: new Date().toISOString(),
        tier_rapport: {
          origine: "import",
          elo: Math.round(elo * 100) / 100,
          seuil: scoring.eloSeuil,
          tier,
          passages: passagesPourTier(tier),
        },
      })
      .eq("id", contenuId);
    if (errT) throw errT;
  }

  return tier;
}

/** Normalise un code langue (fr, en, …) ou null si invalide. */
function normaliserLangue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase().slice(0, 8);
  if (!(LANGUES_CIBLES as readonly string[]).includes(code)) return null;
  return code;
}

/**
 * Import d'un lien TikTok isolé.
 * `langueExplicit` = langue d'origine choisie à l'import (prioritaire).
 * Sinon `comptes_reference.langue`. Plus de défaut silencieux « fr ».
 */
export async function importerLien(
  supabase: Supabase,
  postUrl: string,
  compteReferenceId: string | null,
  labelIds: string[] | null,
  langueExplicit: string | null = null,
  applicationIdExplicit: string | null = null,
): Promise<{ id: string; reused: boolean }> {
  const [post] = await scrapePost(postUrl);
  if (!post) throw new Error("Post introuvable ou non scrapable");
  if (post.imageUrls.length === 0) throw new Error("Pas un diaporama (aucune image)");

  let langue = normaliserLangue(langueExplicit);
  if (!langue && compteReferenceId) {
    const { data: ref } = await supabase
      .from("comptes_reference")
      .select("langue")
      .eq("id", compteReferenceId)
      .maybeSingle();
    langue = normaliserLangue(ref?.langue ?? null);
  }
  if (!langue) {
    throw new Error(
      "Langue d'origine du TikTok requise (précise-la à l'import)",
    );
  }
  return creerContenuDepuisPost(
    supabase,
    post,
    compteReferenceId,
    labelIds,
    langue,
    applicationIdExplicit,
  );
}

/**
 * Liste les URLs de diaporamas à importer pour un compte (sans scraper les
 * visuels). Le client lance ensuite 1 agent scrapePost par URL en parallèle.
 */
/**
 * Ids TikTok déjà en stock. Paginé : sans `range`, PostgREST s'arrête à ~1000
 * lignes et on ré-enfile alors des slideshows déjà importés.
 */
async function idsTiktokConnus(
  supabase: Supabase,
  compteReferenceId: string,
): Promise<{ tous: Set<string>; deCetteSource: string[] }> {
  const applicationId = await applicationIdDeSource(supabase, compteReferenceId);
  const tous = new Set<string>();
  const deCetteSource: string[] = [];
  for (let from = 0; ; from += PAGE_POSTGREST) {
    let q = supabase
      .from("contenus")
      .select("source_url, compte_reference_id")
      .not("source_url", "is", null)
      .range(from, from + PAGE_POSTGREST - 1);
    if (applicationId) q = q.eq("application_id", applicationId);
    const { data, error } = await q;
    if (error) throw error;
    const lot = data ?? [];
    for (const row of lot) {
      const id = idDe(row.source_url ?? "");
      tous.add(id);
      if (row.compte_reference_id === compteReferenceId) deCetteSource.push(id);
    }
    if (lot.length < PAGE_POSTGREST) break;
  }
  return { tous, deCetteSource };
}

export interface ListingCompte {
  handle: string;
  /** URLs à enfiler, déjà ordonnées par vues décroissantes. */
  urls: string[];
  /** Slideshows découverts sur le profil. */
  total: number;
  /** Parmi eux, ceux déjà en stock. */
  connus: number;
  /** Découverts mais jamais importés — ce que « Mettre à jour » rattrape. */
  manquants: number;
  /** Sous-ensemble des manquants publié depuis le dernier import (indicatif). */
  nouveaux: number;
  source: "page" | "apify" | "mixte" | "aucune";
  /** Pourquoi la découverte a donné ça — remonté tel quel dans les logs UI. */
  diagnostic: string[];
}

/**
 * Découvre les slideshows d'un compte source.
 *
 * `nouveauxSeulement` (bouton « Mettre à jour ») enfile **tout ce qui manque**,
 * pas seulement ce qui est postérieur au dernier scrape : un premier import
 * tronqué (plafond de listing, handle invalide, Apify en carafe) laissait sinon
 * des dizaines de slideshows inatteignables à vie, l'update répondant « aucun
 * nouveau » alors que le stock était incomplet.
 */
export async function listerUrlsCompteReference(
  supabase: Supabase,
  compteReferenceId: string,
  opts: { nouveauxSeulement?: boolean; marquerScrape?: boolean } = {},
): Promise<ListingCompte> {
  const { data: ref } = await supabase
    .from("comptes_reference")
    .select("id, handle_tiktok, dernier_scrape_at")
    .eq("id", compteReferenceId)
    .single();
  if (!ref) throw new Error("Compte de référence introuvable");

  // Le champ contient parfois l'URL du profil collée telle quelle : sans
  // normalisation, la page publique était interrogée sur une URL absurde et
  // seule la première tranche Apify remontait.
  const handle = normaliserHandleTiktok(String(ref.handle_tiktok ?? ""));
  if (!handle) throw new Error(`Handle TikTok illisible : « ${ref.handle_tiktok} »`);

  const { tous: deja, deCetteSource } = await idsTiktokConnus(supabase, compteReferenceId);
  const maxIdConnu = maxIdTiktok(deCetteSource);

  const vues = new Map<string, number>();
  const createTimeParId = new Map<string, number>();
  const urlsSet = new Set<string>();
  const diagnostic: string[] = [];
  let viaPage = 0;
  let viaApify = 0;

  // 1) Page publique TikTok (gratuit, rapide) — IDs photo uniquement.
  try {
    const depuisPage = await listerDiaporamas(handle);
    for (const u of depuisPage) urlsSet.add(u);
    viaPage = depuisPage.length;
    diagnostic.push(`page TikTok: ${viaPage} slideshow(s)`);
  } catch (error) {
    diagnostic.push(`page TikTok indisponible: ${messageErreur(error)}`);
  }

  // 2) Apify profil sans télécharger les images — complète / ordonne par vues.
  //    Chaque slideshow sera re-scrapé individuellement ensuite (1 agent / post).
  try {
    const posts = await listerPostsProfil(handle, SCRAPE_TOUS);
    for (const p of posts) {
      if (!p.webVideoUrl) continue;
      const estPhoto =
        p.imageUrls.length > 0 ||
        /\/photo\//.test(p.webVideoUrl) ||
        urlsSet.has(p.webVideoUrl);
      if (!estPhoto) continue;
      urlsSet.add(p.webVideoUrl);
      viaApify += 1;
      const pid = idDe(p.webVideoUrl);
      vues.set(pid, p.stats?.vues ?? 0);
      const ct = normaliserCreateTime(p.createTime);
      if (ct) createTimeParId.set(pid, ct);
    }
    diagnostic.push(
      `Apify: ${viaApify} slideshow(s) sur ${posts.length} post(s) (plafond ${SCRAPE_TOUS})`,
    );
    if (posts.length >= SCRAPE_TOUS) {
      diagnostic.push(
        `plafond de listing atteint — relance pour aller plus loin ou monte IMPORT_LISTING_MAX`,
      );
    }
  } catch (error) {
    diagnostic.push(`Apify indisponible: ${messageErreur(error)}`);
  }

  const source: ListingCompte["source"] =
    viaPage > 0 && viaApify > 0 ? "mixte" : viaApify > 0 ? "apify" : viaPage > 0 ? "page" : "aucune";

  // Tous les slideshows (inédits + déjà connus) : les connus seront réouverts
  // sur le même contenu (re-pipeline, historique Passages conservé) — sauf
  // `nouveauxSeulement`, qui ne reprend que ce qui manque.
  const toutes = [...urlsSet].sort(
    (a, b) => (vues.get(idDe(b)) ?? 0) - (vues.get(idDe(a)) ?? 0),
  );
  const manquantes = urlsManquantes(toutes, deja);
  const dernierImportAt = ref.dernier_scrape_at
    ? new Date(String(ref.dernier_scrape_at))
    : null;
  const nouveaux = manquantes.filter((u) =>
    estNouveauDepuisImport({
      url: u,
      createTime: createTimeParId.get(idDe(u)) ?? null,
      connusIds: deja,
      dernierImportAt,
      maxIdConnu,
    }),
  ).length;
  const urls = opts.nouveauxSeulement ? manquantes : toutes;

  // Ne dater le scrape que s'il a réellement vu le profil : sinon un listing
  // en échec marquait le compte « à jour » et gelait les updates suivants.
  if (opts.marquerScrape && toutes.length > 0) {
    await supabase
      .from("comptes_reference")
      .update({ dernier_scrape_at: new Date().toISOString() })
      .eq("id", compteReferenceId);
  }

  return {
    handle,
    urls,
    total: toutes.length,
    connus: toutes.length - manquantes.length,
    manquants: manquantes.length,
    nouveaux,
    source,
    diagnostic,
  };
}

/**
 * Legacy : scrape profil + crée tous les contenus en série.
 * Préférer listerUrls + 1 agent scrapePost / slideshow côté client.
 */
export async function importerCompteReference(
  supabase: Supabase,
  compteReferenceId: string,
): Promise<{ crees: number; ids: string[]; scrapes: number }> {
  const listed = await listerUrlsCompteReference(supabase, compteReferenceId, {
    marquerScrape: true,
  });
  const ids: string[] = [];
  let crees = 0;
  for (const url of listed.urls) {
    try {
      const r = await importerLien(supabase, url, compteReferenceId, null);
      if (!r.reused) {
        crees += 1;
        ids.push(r.id);
      } else {
        ids.push(r.id);
      }
    } catch {
      // un post isolé en échec n'arrête pas le lot
    }
  }
  return { crees, ids, scrapes: listed.total };
}

async function marquer(
  supabase: Supabase,
  contenuId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("contenus").update(patch).eq("id", contenuId);
  if (error) throw error;
}

export interface NettoyageSlideRapport {
  position: number;
  ok: boolean;
  moteur?: string;
  motif?: string;
  lignes: string[];
}

export interface NettoyageRapport {
  slides: NettoyageSlideRapport[];
  /** Texte multiligne pour les logs d'import. */
  texte: string;
}

export interface CaptionSlideRapport {
  position: number;
  ok: boolean;
  modele?: string;
  caption?: string | null;
  hook?: boolean;
  lignes: string[];
}

export interface CaptionRapport {
  slides: CaptionSlideRapport[];
  texte: string;
}

export interface AvancerImportResultat {
  etape: string;
  /**
   * Le passage a-t-il fait avancer le pipeline ? Un passage stérile incrémente
   * `import_tentatives`, qui sert de priorité inverse dans `claimContenu` :
   * un diaporama récalcitrant laisse ainsi passer les autres imports.
   */
  progres: boolean;
  /** Présent sur les étapes elo / elo_insuffisant. */
  elo?: EloRapport;
  /** Présent sur l'étape nettoyage. */
  nettoyage?: NettoyageRapport;
  /** Présent sur l'étape caption. */
  captions?: CaptionRapport;
}

/** Ligne `contenus` telle que renvoyée par le claim (colonnes non typées). */
// deno-lint-ignore no-explicit-any
type ContenuRow = any;

/**
 * Avance le pipeline d'UN pas et tient à jour le compteur d'échecs stériles.
 */
export async function avancerImport(
  supabase: Supabase,
  contenu: ContenuRow,
): Promise<AvancerImportResultat> {
  const r = await executerPasImport(supabase, contenu);
  const tentatives = Number(contenu.import_tentatives ?? 0);
  try {
    await marquer(supabase, contenu.id, {
      import_tentatives: r.progres ? 0 : tentatives + 1,
    });
  } catch {
    // Bookkeeping de priorité : ne doit jamais faire échouer le passage.
  }
  return r;
}

/**
 * Un pas du pipeline. Ordre :
 * OCR hook → pertinence → OCR reste → ELO par langue (gate) → nettoyage (1×)
 * → caption visuelle (Florence → Moondream) → valide (texte OCR source uniquement).
 *
 * Sophia + traduction hors-source = à l'assignation minuit
 * (`assurerDeckPourLangue`), pas à l'import.
 */
async function executerPasImport(
  supabase: Supabase,
  contenu: ContenuRow,
): Promise<AvancerImportResultat> {
  const slides: SlideBrut[] = [...(contenu.structure_slides ?? [])];
  const langueSource: string = contenu.langue_source ?? "fr";

  try {
    if (slides.length === 0) throw new Error("Contenu sans visuel");

    await marquer(supabase, contenu.id, {
      import_statut: "running",
      import_erreur: null,
    });

    // Reprise : réhydrate l'OCR depuis la langue source si besoin.
    if (slides.some((s) => s.texte_original == null)) {
      const { data: srcLang } = await supabase
        .from("contenu_langues")
        .select("slides")
        .eq("contenu_id", contenu.id)
        .eq("langue", langueSource)
        .maybeSingle();
      const srcSlides = (srcLang?.slides ?? []) as SlideLangue[];
      if (srcSlides.length > 0) {
        const parPos = new Map(srcSlides.map((s) => [s.position, s.texte_overlay]));
        for (const s of slides) {
          if (s.texte_original == null && parPos.has(s.position)) {
            s.texte_original = parPos.get(s.position) ?? "";
          }
        }
      }
    }

    // 1 — OCR du hook
    if (slides[0] && (slides[0].texte_original === null || slides[0].texte_original === undefined)) {
      slides[0].texte_original = await ocrFrame(slides[0].raw_url);
      await marquer(supabase, contenu.id, {
        structure_slides: slides,
        import_etape: "ocr",
      });
      return { etape: "ocr", progres: true };
    }

    // 2 — Pertinence (métrique ELO ; pas de rejet dur ici)
    if (contenu.pertinence_score === null || contenu.pertinence_score === undefined) {
      const slugApp = await slugApplicationDeContenu(supabase, contenu);
      const { score, reason } = await scoreRelevance({
        caption: contenu.titre ?? "",
        hookText: slides[0]?.texte_original ?? "",
        instructions: await chargerPrompt(supabase, clePromptPertinence(slugApp)),
      });
      await marquer(supabase, contenu.id, {
        pertinence_score: score,
        pertinence_raison: reason,
        statut: "brouillon",
        import_etape: "pertinence",
      });
      return { etape: "pertinence", progres: true };
    }

    if (contenu.statut === "rejete") {
      await marquer(supabase, contenu.id, { import_statut: "done", import_etape: "rejete" });
      return { etape: "rejete", progres: true };
    }

    // 3 — OCR du reste
    const aOcr = slides.filter((s) => s.texte_original === null || s.texte_original === undefined);
    if (aOcr.length > 0) {
      for (const slide of aOcr.slice(0, SLIDES_PAR_PASSAGE)) {
        slide.texte_original = await ocrFrame(slide.raw_url);
      }
      await marquer(supabase, contenu.id, {
        structure_slides: slides,
        import_etape: "ocr",
      });
      return { etape: "ocr", progres: true };
    }

    // 4 — Note /100 de la langue source → premier placement en tierlist
    {
      const scoring = await lireScoring(supabase);
      const elo = rapportEloComplet({
        pertinence: Number(contenu.pertinence_score ?? 0),
        vues: contenu.vues_source ?? null,
        langueSource,
        prior: scoring.prior,
        k: scoring.k,
        poidsVues: scoring.poidsVues,
        vuesPlafond: scoring.vuesPlafond,
        seuil: scoring.eloSeuil,
      });
      // Toujours persister le détail (historique + logs UI).
      await marquer(supabase, contenu.id, { import_elo_rapport: elo });

      const tier = await assurerTierImport(
        supabase,
        contenu.id,
        langueSource,
        contenu.vues_source ?? null,
        Number(contenu.pertinence_score ?? 0),
      );
      if (!tier) {
        await marquer(supabase, contenu.id, {
          statut: "rejete",
          import_statut: "done",
          import_etape: "elo_insuffisant",
          import_erreur:
            `Note ${elo.elo.toFixed(1)} sous le seuil ${elo.seuil} — TikTok non importé`,
          import_elo_rapport: elo,
        });
        return { etape: "elo_insuffisant", elo, progres: true };
      }

      // Sync OCR → deck langue source (toujours, base pour traductions ultérieures).
      {
        const { data: cl } = await supabase
          .from("contenu_langues")
          .select("id, slides")
          .eq("contenu_id", contenu.id)
          .eq("langue", langueSource)
          .maybeSingle();
        const vides = !cl?.slides || (Array.isArray(cl.slides) && cl.slides.length === 0);
        if (vides && cl) {
          const slidesSource: SlideLangue[] = slides.map((s) => ({
            position: s.position,
            texte_overlay: s.texte_original ?? "",
            position_sophia: false,
          }));
          await supabase
            .from("contenu_langues")
            .update({ slides: slidesSource })
            .eq("id", cl.id);
        }
      }

      if (contenu.import_etape !== "elo" && contenu.import_etape !== "nettoyage" &&
          contenu.import_etape !== "caption" &&
          contenu.import_etape !== "traduction" && contenu.import_etape !== "sophia" &&
          contenu.import_etape !== "done") {
        await marquer(supabase, contenu.id, { import_etape: "elo" });
        return { etape: "elo", elo, progres: true };
      }
    }

    // 5 — Nettoyage image UNE fois (language-agnostique)
    if (slides.some((s) => !s.media_id)) {
      const rapports: NettoyageSlideRapport[] = [];
      let progres = false;

      // 5a — Slides à bout d'essais : on les sort de la file SANS rappeler le
      // provider. Sinon elles repassent en tête à chaque passage et le reste du
      // diaporama (puis les autres comptes) n'est jamais nettoyé.
      for (const slide of slidesEpuisees(slides)) {
        const rapport: NettoyageSlideRapport = {
          position: slide.position,
          ok: false,
          lignes: [
            `slide #${slide.position} · ${tentativesSlide(slide)} tentatives épuisées`,
          ],
        };
        const secours =
          (await trouverPropreExistant(supabase, contenu.id, slide.position))?.id ??
            (await tenterRemplacementLabel(supabase, contenu, slides, rapport));
        slide.media_id = secours ?? (await stockerBrut(supabase, contenu, slide));
        slide.tentatives = undefined;
        rapport.ok = Boolean(secours);
        rapport.motif = secours
          ? "récupéré après tentatives épuisées"
          : "brut après max tentatives";
        rapport.lignes.push(`→ media_id=${slide.media_id} · file débloquée`);
        await patchSlideMediaId(supabase, contenu.id, slide.position, slide.media_id);
        rapports.push(rapport);
        progres = true;
      }

      // 5b — Une slide « fraîche » par passage, la moins tentée d'abord : une
      // slide capricieuse ne monopolise pas le diaporama.
      for (
        const slide of prochainesSlidesANettoyer(slides, SLIDES_NETTOYAGE_PAR_PASSAGE)
      ) {
        const r = await nettoyerSlide(supabase, contenu, slide);
        rapports.push(r.rapport);
        slide.tentatives = r.tentatives;

        let lie = r.mediaId;
        if (!lie) {
          // Fal a peut‑être uploadé puis le worker est mort avant le lien.
          const orphelin = await trouverPropreExistant(
            supabase,
            contenu.id,
            slide.position,
          );
          if (orphelin) {
            lie = orphelin.id;
            r.rapport.ok = true;
            r.rapport.motif = "propre orphelin rattache";
            r.rapport.lignes.push(
              `→ propre deja en storage rattache media_id=${orphelin.id}`,
            );
          } else {
            lie = await tenterRemplacementLabel(supabase, contenu, slides, r.rapport);
          }
        }

        if (lie) {
          slide.media_id = lie;
          slide.tentatives = undefined;
          // Patch atomique : survit aux lost-updates / timeout après upload,
          // et remet `tentatives` à zéro côté base.
          await patchSlideMediaId(supabase, contenu.id, slide.position, lie);
          progres = true;
        } else {
          r.rapport.lignes.push(
            r.tentatives >= MAX_TENTATIVES_NETTOYAGE
              ? `→ tentatives épuisées (${r.tentatives}/${MAX_TENTATIVES_NETTOYAGE}) — repli brut au prochain passage`
              : `→ retry prévu (${r.tentatives}/${MAX_TENTATIVES_NETTOYAGE})`,
          );
        }
      }

      // `structure_slides` n'est pas réécrit en entier ici : media_id et
      // tentatives passent par les RPC atomiques, un write complet écraserait
      // le travail d'un worker parallèle (la boucle d'origine).
      await marquer(supabase, contenu.id, { import_etape: "nettoyage" });

      const nettoyage: NettoyageRapport = {
        slides: rapports,
        texte: rapports
          .map((s) => {
            const moteurLabel =
              s.moteur === "text_removal"
                ? "Fal"
                : s.moteur === "replicate_text_removal"
                  ? "FALLBACK Replicate"
                  : s.moteur ?? "—";
            const head =
              `══ slide #${s.position} · ${s.ok ? "OK" : "ÉCHEC"} · moteur=${moteurLabel}` +
              (s.motif ? ` · ${s.motif}` : "");
            return [head, ...s.lignes.map((l) => `  ${l}`)].join("\n");
          })
          .join("\n"),
      };
      return { etape: "nettoyage", nettoyage, progres };
    }

    // 6 — Caption visuelle (Florence → Moondream → aucune) + Hook 1ʳᵉ slide
    {
      const aCaption = await slidesSansCaption(supabase, slides);
      if (aCaption.length > 0) {
        const rapports: CaptionSlideRapport[] = [];
        for (const slide of aCaption.slice(0, SLIDES_CAPTION_PAR_PASSAGE)) {
          rapports.push(await capturerCaptionSlide(supabase, contenu, slide));
        }
        await marquer(supabase, contenu.id, { import_etape: "caption" });
        const captions: CaptionRapport = {
          slides: rapports,
          texte: rapports
            .map((s) => {
              const head =
                `══ slide #${s.position} · ${s.ok ? "OK" : "aucune"}` +
                (s.modele ? ` · ${s.modele}` : "") +
                (s.hook ? " · Hook" : "");
              const cap = s.caption ? `  « ${s.caption} »` : "";
              return [head, cap, ...s.lignes.map((l) => `  ${l}`)]
                .filter(Boolean)
                .join("\n");
            })
            .join("\n"),
        };
        return { etape: "caption", captions, progres: rapports.length > 0 };
      }
    }

    // 7 — Rafraîchit la note d'import (langue source) puis valide.
    // Cette note est un historique : le placement se joue sur `contenus.tier`.
    // Texte stocké = OCR source uniquement (pas de pub Sophia, pas de trad).
    // Sophia + traduction hors-source → `assurerDeckPourLangue` à l'assignation.
    const { data: langueSourceRow } = await supabase
      .from("contenu_langues")
      .select("id")
      .eq("contenu_id", contenu.id)
      .eq("langue", langueSource)
      .maybeSingle();

    const scoring = await lireScoring(supabase);
    const forcerSeuil = Boolean(contenu.import_elo_force_seuil);
    if (langueSourceRow) {
      let score = eloParLangue({
        pertinence: Number(contenu.pertinence_score ?? 0),
        vues: contenu.vues_source,
        langue: langueSource,
        langueSource,
        prior: scoring.prior,
        k: scoring.k,
        poidsVues: scoring.poidsVues,
        vuesPlafond: scoring.vuesPlafond,
      });
      if (forcerSeuil) score = Math.max(score, scoring.eloSeuil);
      await supabase
        .from("contenu_langues")
        .update({
          score,
          score_maj_at: new Date().toISOString(),
        })
        .eq("id", langueSourceRow.id);
    }

    // Strip texte_original des slides partagées (reste language-agnostique)
    const slidesPropres = slides.map((s) => ({
      position: s.position,
      media_id: s.media_id,
      raw_url: s.raw_url,
      reference_url: s.reference_url ?? s.raw_url,
    }));

    await marquer(supabase, contenu.id, {
      structure_slides: slidesPropres,
      statut: "valide",
      import_statut: "done",
      import_etape: "done",
      import_erreur: null,
      import_tentatives: 0,
    });
    return { etape: "done", progres: true };
  } catch (error) {
    await marquer(supabase, contenu.id, {
      import_statut: "failed",
      import_erreur: messageErreur(error),
    });
    return { etape: "failed", progres: false };
  }
}

async function voixSource(
  supabase: Supabase,
  compteReferenceId: string | null,
): Promise<string | null> {
  if (!compteReferenceId) return null;
  const { data } = await supabase
    .from("comptes_reference")
    .select("style_profile")
    .eq("id", compteReferenceId)
    .maybeSingle();
  return data?.style_profile ?? null;
}

/** Place Sophia sur un deck déjà texté. Renvoie "ok" | "retry". */
async function placerSophiaSurDeck(
  supabase: Supabase,
  // deno-lint-ignore no-explicit-any
  contenu: any,
  contenuLangueId: string,
  deck: SlideLangue[],
  langue: string,
): Promise<"ok" | "retry"> {
  const { data: corrections } = await supabase
    .from("corrections")
    .select("texte_origine, texte_corrige")
    .order("created_at", { ascending: false })
    .limit(40);

  const slugApp = await slugApplicationDeContenu(supabase, contenu);
  const placement = await integrateSophia({
    masterPrompt: (await chargerPrompt(supabase, clePromptPlacement(slugApp))) ?? "",
    corrections: (corrections ?? []).map((c) => ({
      original_text: c.texte_origine,
      corrected_text: c.texte_corrige,
    })),
    slides: deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
    caption: contenu.titre ?? "",
    langue,
    marque: slugApp,
  });

  if (placement) {
    const idx = deck.findIndex((s) => s.position === placement.chosenPosition);
    if (idx >= 0) {
      deck[idx] = {
        ...deck[idx],
        texte_overlay: placement.variants[placement.bestIndex],
        position_sophia: true,
      };
      await supabase.from("contenu_langues").update({ slides: deck }).eq("id", contenuLangueId);
      return "ok";
    }
  }
  return "retry";
}

/**
 * Garantit un deck prêt (texte + Sophia) pour une langue à l'assignation minuit.
 * - Import ne stocke que l'OCR source (sans Sophia).
 * - Ici : si langue ≠ source → traduit depuis OCR source ; puis place Sophia.
 * - Une fois cuit, le deck langue est persisté (réutilisé aux passages suivants).
 * - Hashtags : produits dans la même passe de traduction, stockés sur la ligne
 *   contenu_langues pour les passages suivants.
 */
export async function assurerDeckPourLangue(
  supabase: Supabase,
  contenuId: string,
  langue: string,
): Promise<{ slides: SlideLangue[]; hashtags: string }> {
  const { data: contenu } = await supabase
    .from("contenus")
    .select("id, titre, langue_source, compte_reference_id, structure_slides")
    .eq("id", contenuId)
    .single();
  if (!contenu) throw new Error("Contenu introuvable");

  let { data: cl } = await supabase
    .from("contenu_langues")
    .select("id, langue, slides, hashtags")
    .eq("contenu_id", contenuId)
    .eq("langue", langue)
    .maybeSingle();
  if (!cl) {
    // Plus de gate par langue : toutes les langues sont postables, leur deck
    // naît ici, à la première assignation d'un compte de cette langue.
    if (!(LANGUES_CIBLES as readonly string[]).includes(langue)) {
      throw new Error(`Langue ${langue} hors langues cibles`);
    }
    const { data: creee, error: errCl } = await supabase
      .from("contenu_langues")
      .insert({
        contenu_id: contenuId,
        langue,
        slides: [] as SlideLangue[],
        nb_passages: 0,
      })
      .select("id, langue, slides, hashtags")
      .single();
    if (errCl || !creee) {
      throw errCl ?? new Error(`Création ligne langue ${langue} échouée`);
    }
    cl = creee;
  }

  let deck = [...((cl.slides ?? []) as SlideLangue[])];
  let hashtags = ((cl as { hashtags?: string | null }).hashtags ?? "").trim();
  const pret =
    deck.length > 0 &&
    deck.some((s) => s.texte_overlay) &&
    deck.some((s) => s.position_sophia);
  if (pret) return { slides: deck, hashtags };

  const langueSource = contenu.langue_source ?? "fr";

  // Besoin du deck source comme base de traduction
  const { data: clSource } = await supabase
    .from("contenu_langues")
    .select("id, slides")
    .eq("contenu_id", contenuId)
    .eq("langue", langueSource)
    .maybeSingle();
  const deckSource = [...((clSource?.slides ?? []) as SlideLangue[])];
  if (deckSource.length === 0 || !deckSource.some((s) => s.texte_overlay)) {
    throw new Error("Deck langue source vide — impossible de traduire");
  }

  if (langue === langueSource) {
    deck = deckSource;
  } else if (deck.length === 0 || deck.every((s) => !s.texte_overlay)) {
    const voix = await voixSource(supabase, contenu.compte_reference_id);
    const dedie = await chargerPrompt(supabase, `traduction_${langue}`);
    const base =
      dedie ?? (langue === "fr" ? await chargerPrompt(supabase, "traduction") : undefined);
    const regles = [base, voix ? `Voix propre à cette source :\n${voix}` : null]
      .filter(Boolean)
      .join("\n\n");

    const traductions = await translateSlideshow({
      slides: deckSource.map((s) => ({
        position: s.position,
        original: s.texte_overlay ?? "",
      })),
      sourceTitle: contenu.titre ?? "",
      rules: regles || undefined,
      langue,
      variation: false,
    });
    const parPos = new Map(traductions.slides.map((t) => [t.position, t.translated]));
    deck = deckSource.map((s) => ({
      position: s.position,
      texte_overlay: parPos.get(s.position) ?? "",
      position_sophia: false,
    }));
    if (traductions.hashtags) hashtags = traductions.hashtags;
    await supabase
      .from("contenu_langues")
      .update({ slides: deck, hashtags: hashtags || null })
      .eq("id", cl.id);
  }

  if (!deck.some((s) => s.position_sophia)) {
    const r = await placerSophiaSurDeck(supabase, contenu, cl.id, deck, langue);
    if (r === "retry") {
      const derniere = deck[deck.length - 1];
      if (derniere) {
        derniere.texte_overlay = placementParDefaut(
          langue,
          await slugApplicationDeContenu(supabase, contenu),
        );
        derniere.position_sophia = true;
        await supabase.from("contenu_langues").update({ slides: deck }).eq("id", cl.id);
      }
    }
  }

  const { data: frais } = await supabase
    .from("contenu_langues")
    .select("slides, hashtags")
    .eq("id", cl.id)
    .single();
  return {
    slides: (frais?.slides ?? deck) as SlideLangue[],
    hashtags: ((frais as { hashtags?: string | null } | null)?.hashtags ?? hashtags ?? "").trim(),
  };
}

// deno-lint-ignore no-explicit-any
async function prolongerLease(supabase: Supabase, contenuId: string): Promise<void> {
  await supabase
    .from("contenus")
    .update({
      import_lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
      import_statut: "running",
    })
    .eq("id", contenuId);
}

/**
 * Stocke le résultat Fal/Replicate. verifyClean est en pause (pas d'appel Gemini).
 *
 * Ne relance jamais : tout échec revient en `mediaId: null` avec le compteur de
 * tentatives à jour, pour que l'appelant décide (orphelin, biblio, brut).
 */
async function nettoyerSlide(
  supabase: Supabase,
  contenu: any,
  slide: SlideBrut,
): Promise<{
  mediaId: string | null;
  tentatives: number;
  rapport: NettoyageSlideRapport;
}> {
  const labelEtape: Record<string, string> = {
    text_removal: "① Fal",
    replicate_text_removal: "② FALLBACK Replicate",
    upscale: "③ Upscale SeedVR",
    c2pa: "④ Enlève clés C2PA",
    ready: "⑤ Ready",
  };
  const lignes: string[] = [
    `slide #${slide.position} · url=${(slide.raw_url ?? "").slice(0, 72)}…`,
    `pipeline: ① Fal → ② Replicate → ③ Upscale SeedVR → ④ C2PA → ⑤ stockage`,
  ];
  const rapport: NettoyageSlideRapport = {
    position: slide.position,
    ok: false,
    lignes,
  };

  await prolongerLease(supabase, contenu.id);

  // Reprise : upload OK lors d'un passage précédent, lien media_id perdu.
  const deja = await trouverPropreExistant(supabase, contenu.id, slide.position);
  if (deja) {
    rapport.ok = true;
    rapport.moteur = "reuse";
    lignes.push(`reuse propre existant ${deja.storage_path} → ${deja.id}`);
    await patchSlideMediaId(supabase, contenu.id, slide.position, deja.id);
    if (slide.position === 1) {
      try {
        await assurerHookMedia(supabase, deja.id);
        lignes.push("label Hook (1ʳᵉ slide)");
      } catch (e) {
        lignes.push(`warn hook: ${messageErreur(e)}`);
      }
    }
    return { mediaId: deja.id, tentatives: 0, rapport };
  }

  // Tentative comptée AVANT l'appel provider : le mur Edge (~150 s) tue le
  // worker en plein nettoyage, et un compteur écrit après ne serait jamais
  // persisté — la slide repartirait indéfiniment pour un tour.
  let tentatives = tentativesSlide(slide) + 1;
  try {
    tentatives = await incrementerTentativeSlide(supabase, contenu.id, slide.position);
  } catch (e) {
    lignes.push(`warn compteur tentatives: ${messageErreur(e)}`);
  }
  lignes.push(`tentative ${tentatives}/${MAX_TENTATIVES_NETTOYAGE}`);

  let propreBase64: string | null = null;
  let moteur: string | undefined;
  let mimeDeclare = "image/jpeg";
  let upscaleFait = false;
  try {
    const propre = await cleanImage(
      slide.raw_url,
      (e) => {
        const nom = labelEtape[e.etape] ?? e.etape;
        const line = `${nom} · ${e.statut}${e.detail ? ` — ${e.detail}` : ""}`;
        if (
          (e.etape === "text_removal" || e.etape === "upscale") &&
          e.statut === "encours" &&
          e.detail?.includes("poll #") &&
          lignes.length > 0 &&
          lignes[lignes.length - 1]?.includes("poll #")
        ) {
          lignes[lignes.length - 1] = line;
        } else {
          lignes.push(line);
        }
        console.log(
          `[import nettoyage] contenu=${contenu.id} slide=${slide.position} ${line}`,
        );
      },
      // Import TikTok slideshow : upscale Fal avant strip métadonnées.
      { upscaleAvantStrip: true },
    );
    propreBase64 = propre?.base64 ?? null;
    moteur = propre?.moteur;
    mimeDeclare = propre?.mime ?? "image/jpeg";
    upscaleFait = Boolean(propre?.upscale);
    rapport.moteur = moteur;
  } catch (error) {
    const msg = messageErreur(error);
    lignes.push(`exception: ${msg}`);
    rapport.motif = msg;
    console.warn(
      `[import nettoyage] contenu=${contenu.id} slide=${slide.position} ${msg}`,
    );
    return { mediaId: null, tentatives, rapport };
  }

  await prolongerLease(supabase, contenu.id);

  if (!propreBase64) {
    rapport.motif = "aucune image renvoyée";
    lignes.push("échec: aucune image après Fal + fallbacks");
    return { mediaId: null, tentatives, rapport };
  }

  await prolongerLease(supabase, contenu.id);

  // Stockage : une erreur ici ne doit pas remonter, sinon `avancerImport`
  // bascule en `failed` sans laisser l'appelant tenter orphelin / biblio / brut.
  let media: { id: string };
  try {
    const { mime, ext } = mimeDepuisBase64(propreBase64, mimeDeclare);
    const path = `propre/${contenu.id}/${slide.position}.${ext}`;
    const bytes = Uint8Array.from(atob(propreBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: "0",
      });
    if (upErr) throw upErr;

    // Lien media_id AVANT labels (labels ne doivent pas faire perdre le Fal OK).
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const url = `${publicUrl}?v=${Date.now()}`;

    const { data, error } = await supabase
      .from("media_library")
      .upsert(
        {
          compte_reference_id: contenu.compte_reference_id,
          contenu_id: contenu.id,
          application_id: contenu.application_id ?? undefined,
          storage_path: path,
          url,
          source: "nettoye_reference",
          langue: contenu.langue_source,
          visage_identifiable: null,
          verifie_le: new Date().toISOString(),
          texte_restant: false,
          // Évite un 2ᵉ SeedVR au minuit si l'upscale import a réussi.
          ...(upscaleFait ? { upscale_le: new Date().toISOString() } : {}),
        },
        { onConflict: "storage_path" },
      )
      .select("id")
      .single();
    if (error) throw error;
    media = data;
  } catch (e) {
    const msg = messageErreur(e);
    rapport.motif = `stockage KO: ${msg}`;
    lignes.push(`échec stockage après nettoyage: ${msg}`);
    console.warn(
      `[import nettoyage] contenu=${contenu.id} slide=${slide.position} stockage ${msg}`,
    );
    return { mediaId: null, tentatives, rapport };
  }

  try {
    await patchSlideMediaId(supabase, contenu.id, slide.position, media.id);
  } catch (e) {
    lignes.push(`warn patch media_id: ${messageErreur(e)}`);
  }

  try {
    const labels = await attacherLabelsAuMedia(supabase, media.id, contenu.id);
    lignes.push(
      `upload OK → media_id=${media.id} · moteur=${moteur ?? "?"}` +
        (upscaleFait ? " · upscale=SeedVR" : "") +
        (labels.length ? ` · labels=${labels.length}` : ""),
    );
  } catch (e) {
    lignes.push(
      `upload OK → media_id=${media.id} · labels KO: ${messageErreur(e)}`,
    );
  }

  rapport.ok = true;
  if (slide.position === 1) {
    try {
      await assurerHookMedia(supabase, media.id);
      lignes.push("label Hook (1ʳᵉ slide)");
    } catch (e) {
      lignes.push(`warn hook: ${messageErreur(e)}`);
    }
  }
  return { mediaId: media.id, tentatives: 0, rapport };
}

async function capturerCaptionSlide(
  supabase: Supabase,
  contenu: ContenuRow,
  slide: { position: number; media_id: string; raw_url?: string | null },
): Promise<CaptionSlideRapport> {
  const lignes: string[] = [`slide #${slide.position}`];
  try {
    const r = await captionnerMedia(supabase, slide.media_id, {
      imageUrl: slide.raw_url ?? null,
    });
    lignes.push(...r.lignes);
    return {
      position: slide.position,
      ok: r.statut === "ok",
      modele: r.modele,
      caption: r.caption,
      hook: r.estHook,
      lignes,
    };
  } catch (e) {
    const msg = messageErreur(e);
    lignes.push(`exception: ${msg}`);
    console.warn(
      `[import caption] contenu=${contenu.id} slide=${slide.position} ${msg}`,
    );
    return { position: slide.position, ok: false, lignes };
  }
}

// deno-lint-ignore no-explicit-any
async function stockerBrut(
  supabase: Supabase,
  contenu: any,
  slide: SlideBrut,
): Promise<string> {
  const { data: media, error } = await supabase
    .from("media_library")
    .upsert(
      {
        compte_reference_id: contenu.compte_reference_id,
        contenu_id: contenu.id,
        application_id: contenu.application_id ?? undefined,
        storage_path: `brut/${contenu.id}/${slide.position}`,
        url: slide.raw_url,
        source: "nettoye_reference",
        langue: contenu.langue_source,
        visage_identifiable: null,
        verifie_le: new Date().toISOString(),
        texte_restant: true,
      },
      { onConflict: "storage_path" },
    )
    .select("id")
    .single();
  if (error) throw error;
  await attacherLabelsAuMedia(supabase, media.id, contenu.id);
  if (slide.position === 1) {
    try {
      await assurerHookMedia(supabase, media.id);
    } catch {
      // Hook : ne bloque pas le repli brut
    }
  }
  return media.id;
}

/** Remplace une slide ratée par un propre même label (biblio). */
async function tenterRemplacementLabel(
  supabase: Supabase,
  // deno-lint-ignore no-explicit-any
  contenu: any,
  slides: SlideBrut[],
  rapport: NettoyageSlideRapport,
): Promise<string | null> {
  const exclus = slides
    .map((s) => s.media_id)
    .filter((id): id is string => Boolean(id));
  const alt = await mediaPropreMemeLabel(supabase, {
    contenuId: contenu.id,
    excludeMediaIds: exclus,
    compteReferenceId: contenu.compte_reference_id,
  });
  if (!alt) {
    rapport.lignes.push(
      "⑥ remplacement biblio : aucun propre avec le même label",
    );
    return null;
  }
  rapport.ok = true;
  rapport.motif = "remplacé (texte résiduel → biblio même label)";
  rapport.lignes.push(
    `⑥ verifyClean KO → remplacement biblio même label → media_id=${alt.id}`,
  );
  console.log(
    `[import nettoyage] contenu=${contenu.id} slide=#${rapport.position} remplacé par ${alt.id}`,
  );
  return alt.id;
}

/** Prochain contenu à faire avancer (file d'import). */
export async function prochainContenu(
  supabase: Supabase,
  contenuId: string | null,
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  let query = supabase
    .from("contenus")
    .select("*")
    .in("import_statut", ["pending", "running", "failed"]);

  if (contenuId) query = query.eq("id", contenuId);
  else {
    query = query
      .order("import_tentatives", { ascending: true })
      .order("pertinence_score", { ascending: true, nullsFirst: true })
      .order("created_at");
  }

  const { data } = await query.limit(1);
  return data?.[0] ?? null;
}

/** Fal peut prendre ~2 min/slide × 2 slides — lease court → double worker écrase le résultat. */
const LEASE_MS = 8 * 60_000;

/**
 * Claim atomique d'un contenu libre (lease) pour workers parallèles.
 *
 * `import_tentatives` en premier critère : un diaporama qui enchaîne les
 * passages stériles passe derrière les imports frais au lieu d'aspirer tous
 * les workers.
 */
export async function claimContenu(
  supabase: Supabase,
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const now = new Date().toISOString();
  const libre = `import_lease_until.is.null,import_lease_until.lt."${now}"`;
  const { data: candidats } = await supabase
    .from("contenus")
    .select("id")
    .in("import_statut", ["pending", "running", "failed"])
    .or(libre)
    .order("import_tentatives", { ascending: true })
    .order("pertinence_score", { ascending: true, nullsFirst: true })
    .order("created_at")
    .limit(8);

  for (const c of candidats ?? []) {
    const lease = new Date(Date.now() + LEASE_MS).toISOString();
    const { data: claimed } = await supabase
      .from("contenus")
      .update({
        import_statut: "running",
        import_lease_until: lease,
      })
      .eq("id", c.id)
      .in("import_statut", ["pending", "running", "failed"])
      .or(libre)
      .select("*")
      .maybeSingle();
    if (claimed) return claimed;
  }
  return null;
}

export interface ImportFileRow {
  id: string;
  post_url: string;
  compte_reference_id: string | null;
  label_ids: string[];
  /** Langue d'origine du TikTok (boost ELO). */
  langue: string | null;
  application_id?: string | null;
  batch_id: string | null;
  statut: string;
  contenu_id: string | null;
  erreur: string | null;
  tentatives: number;
  created_at?: string | null;
}

/** Une URL scrapable est celle d'un post précis, pas celle d'un profil. */
export function estUrlDePost(url: string): boolean {
  return /\/(?:photo|video)\/\d+/.test(url);
}

const LOT_ENQUEUE = 100;

/** Enfile des URLs pour scrape+pipeline serveur (idempotent sur pending/running). */
export async function enqueueImportUrls(
  supabase: Supabase,
  opts: {
    urls: string[];
    compteReferenceId: string | null;
    labelIds?: string[] | null;
    batchId?: string | null;
    /** Langue d'origine — stockée sur chaque ligne import_file. */
    langue?: string | null;
    applicationId?: string | null;
  },
): Promise<{ batchId: string; enqueued: number; skipped: number; invalides: string[] }> {
  const batchId = opts.batchId ?? crypto.randomUUID();
  const langue = normaliserLangue(opts.langue ?? null);
  const applicationId = await applicationIdPourImport(
    supabase,
    opts.compteReferenceId,
    opts.applicationId ?? null,
  );
  let enqueued = 0;
  let skipped = 0;
  const invalides: string[] = [];

  // Une URL de profil enfilée comme un post consomme un run Apify, échoue,
  // et brûle ses tentatives jusqu'à mourir en file. Autant la refuser ici.
  const aEnfiler: string[] = [];
  for (const url of opts.urls) {
    if (estUrlDePost(url)) aEnfiler.push(url);
    else invalides.push(url);
  }

  const ligne = (url: string) => ({
    post_url: url,
    compte_reference_id: opts.compteReferenceId,
    label_ids: opts.labelIds ?? [],
    batch_id: batchId,
    langue,
    application_id: applicationId,
    statut: "pending",
  });

  // Par paquets : 230 insertions unitaires approchaient le mur Edge de 150 s.
  // L'index unique est partiel, donc pas d'`on conflict` possible — en cas de
  // doublon dans un paquet, on retombe ligne à ligne pour ne perdre que lui.
  for (let i = 0; i < aEnfiler.length; i += LOT_ENQUEUE) {
    const lot = aEnfiler.slice(i, i + LOT_ENQUEUE);
    const { error } = await supabase.from("import_file").insert(lot.map(ligne));
    if (!error) {
      enqueued += lot.length;
      continue;
    }
    for (const url of lot) {
      const { error: unitaire } = await supabase.from("import_file").insert(ligne(url));
      if (unitaire) skipped += 1;
      else enqueued += 1;
    }
  }

  return { batchId, enqueued, skipped, invalides };
}

export const MAX_TENTATIVES_IMPORT = 5;

/** Statuts qu'un worker peut reprendre — `running` compris si le bail a expiré. */
export const STATUTS_REPRENABLES = ["pending", "failed", "running"] as const;

/**
 * Claim d'une ligne import_file libre.
 *
 * `running` est repris quand le bail a expiré : un worker tué en plein scrape
 * (timeout Edge, redéploiement) laissait sinon sa ligne bloquée à vie — et,
 * l'index unique couvrant `running`, la ré-enfiler était impossible.
 */
export async function claimImportFile(
  supabase: Supabase,
): Promise<ImportFileRow | null> {
  const now = new Date().toISOString();
  const libre = `lease_until.is.null,lease_until.lt."${now}"`;
  const { data: candidats } = await supabase
    .from("import_file")
    .select("id")
    .in("statut", STATUTS_REPRENABLES)
    .lt("tentatives", MAX_TENTATIVES_IMPORT)
    .or(libre)
    .order("created_at")
    .limit(8);

  for (const c of candidats ?? []) {
    const lease = new Date(Date.now() + LEASE_MS).toISOString();
    const { data: claimed } = await supabase
      .from("import_file")
      .update({
        statut: "running",
        lease_until: lease,
        updated_at: now,
      })
      .eq("id", c.id)
      .in("statut", ["pending", "failed", "running"])
      .or(libre)
      .select("*")
      .maybeSingle();
    if (claimed) return claimed as ImportFileRow;
  }
  return null;
}

/**
 * Panne de capacité côté fournisseur, pas défaut du post : budget Apify saturé,
 * quota, ou erreur serveur. Ça se retente — ça ne se compte pas comme un échec.
 */
export function estErreurCapacite(message: string): boolean {
  return (
    /memory-limit-exceeded|rate.?limit|too many requests|quota/i.test(message) ||
    /Apify (?:402|429|5\d\d)\b/.test(message)
  );
}

/** Fenêtre au-delà de laquelle une ligne qui ne fait que se reporter est abandonnée. */
const REPORT_MAX_MS = 12 * 3600_000;
const REPORT_MS = 3 * 60_000;

/** Scrape une URL en file → crée/réouvre le contenu (pipeline ensuite via claimContenu). */
export async function traiterImportFile(
  supabase: Supabase,
  row: ImportFileRow,
): Promise<{ ok: boolean; contenuId?: string; erreur?: string; reporte?: boolean }> {
  try {
    const cree = await importerLien(
      supabase,
      row.post_url,
      row.compte_reference_id,
      row.label_ids?.length ? row.label_ids : null,
      row.langue ?? null,
      row.application_id ?? null,
    );
    await supabase
      .from("import_file")
      .update({
        statut: "done",
        contenu_id: cree.id,
        erreur: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { ok: true, contenuId: cree.id };
  } catch (error) {
    const msg = messageErreur(error);
    const depuis = row.created_at ? Date.now() - new Date(row.created_at).getTime() : 0;

    // Un pic de charge sur Apify renvoie 402 « memory limit » sur des posts
    // parfaitement valides. En comptant ça comme un échec, cinq rafales
    // suffisaient à condamner définitivement le slideshow.
    if (estErreurCapacite(msg) && depuis < REPORT_MAX_MS) {
      const report = new Date(Date.now() + REPORT_MS + Math.random() * REPORT_MS);
      await supabase
        .from("import_file")
        .update({
          statut: "pending",
          erreur: `Report (capacité fournisseur) — ${msg}`,
          lease_until: report.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return { ok: false, erreur: msg, reporte: true };
    }

    await supabase
      .from("import_file")
      .update({
        statut: "failed",
        erreur: msg,
        tentatives: (row.tentatives ?? 0) + 1,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { ok: false, erreur: msg };
  }
}

/**
 * Relance un import rejeté pour note insuffisante : planche la note au seuil,
 * fait entrer le contenu au rang minimum (C, 1 passage), et remet le pipeline
 * en file (nettoyage → valide).
 */
export async function forcerImportElo(
  supabase: Supabase,
  contenuId: string,
): Promise<{ ok: true; elo: EloRapport; langues: string[] } | { ok: false; erreur: string }> {
  const { data: contenu, error } = await supabase
    .from("contenus")
    .select("*")
    .eq("id", contenuId)
    .maybeSingle();
  if (error) return { ok: false, erreur: error.message };
  if (!contenu) return { ok: false, erreur: "Contenu introuvable" };

  const etape = contenu.import_etape as string | null;
  const statut = contenu.statut as string;
  if (statut !== "rejete" && etape !== "elo_insuffisant") {
    return {
      ok: false,
      erreur: "Forçage réservé aux imports rejetés / sous seuil ELO",
    };
  }

  const slides = (contenu.structure_slides ?? []) as SlideBrut[];
  if (slides.length === 0) {
    return { ok: false, erreur: "Aucune slide — scrape incomplet" };
  }

  const langueSource = (contenu.langue_source as string) || "fr";
  const scoring = await lireScoring(supabase);
  const eloBase = rapportEloComplet({
    pertinence: Number(contenu.pertinence_score ?? 0),
    vues: contenu.vues_source ?? null,
    langueSource,
    prior: scoring.prior,
    k: scoring.k,
    poidsVues: scoring.poidsVues,
    vuesPlafond: scoring.vuesPlafond,
    seuil: scoring.eloSeuil,
  });

  const noteForcee = Math.max(eloBase.elo, scoring.eloSeuil);
  const tierForce = tierImport(noteForcee, scoring.eloSeuil) ?? "C";
  const lignesForcees = eloBase.lignes.map((l) => ({
    ...l,
    elo: Math.max(l.elo, scoring.eloSeuil),
    retenue: true,
  }));
  const elo: EloRapport = {
    ...eloBase,
    elo: noteForcee,
    tier: tierForce,
    lignes: lignesForcees,
    texte: [
      `FORCÉ manuellement → note plancher = seuil (${scoring.eloSeuil})`,
      eloBase.texte,
      `note ${eloBase.elo.toFixed(2)} → ${noteForcee.toFixed(2)} (forcée ≥ seuil)`,
      `→ premier placement : ${tierForce} (${passagesPourTier(tierForce)} passage(s))`,
    ].join("\n"),
  };

  // Remplace les lignes langues éventuelles (souvent absentes si rejet).
  await supabase.from("contenu_langues").delete().eq("contenu_id", contenuId);

  const { error: insErr } = await supabase.from("contenu_langues").insert({
    contenu_id: contenuId,
    langue: langueSource,
    slides: [] as SlideLangue[],
    score: noteForcee,
    nb_passages: 0,
    score_maj_at: new Date().toISOString(),
  });
  if (insErr) return { ok: false, erreur: insErr.message };

  const { error: tierErr } = await supabase
    .from("contenus")
    .update({
      tier: tierForce,
      passages_prevus: passagesPourTier(tierForce),
      tier_maj_at: new Date().toISOString(),
      tier_rapport: {
        origine: "import_force",
        elo: Math.round(noteForcee * 100) / 100,
        seuil: scoring.eloSeuil,
        tier: tierForce,
        passages: passagesPourTier(tierForce),
      },
    })
    .eq("id", contenuId);
  if (tierErr) return { ok: false, erreur: tierErr.message };

  // Deck OCR → langue source (comme après un passage ELO OK).
  const { data: cl } = await supabase
    .from("contenu_langues")
    .select("id, slides")
    .eq("contenu_id", contenuId)
    .eq("langue", langueSource)
    .maybeSingle();
  if (cl) {
    const slidesSource: SlideLangue[] = slides.map((s) => ({
      position: s.position,
      texte_overlay: s.texte_original ?? "",
      position_sophia: false,
    }));
    await supabase.from("contenu_langues").update({ slides: slidesSource }).eq("id", cl.id);
  }

  await marquer(supabase, contenuId, {
    statut: "brouillon",
    import_statut: "pending",
    import_etape: "elo",
    import_erreur: null,
    import_tentatives: 0,
    import_lease_until: null,
    import_elo_rapport: elo,
    import_elo_force_seuil: true,
  });

  return { ok: true, elo, langues: [langueSource] };
}

/** Stats d'un batch pour le panneau UI. */
export async function statsImportBatch(
  supabase: Supabase,
  batchId: string,
): Promise<{
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  contenusPending: number;
  contenusDone: number;
}> {
  const { data: rows } = await supabase
    .from("import_file")
    .select("statut, contenu_id")
    .eq("batch_id", batchId);
  const list = rows ?? [];
  const contenuIds = list.map((r) => r.contenu_id).filter(Boolean) as string[];
  let contenusPending = 0;
  let contenusDone = 0;
  if (contenuIds.length > 0) {
    // Un gros rattrapage enfile plusieurs centaines d'URLs dans un même batch.
    const contenus = await lireParLots<
      { id: string; import_statut: string; statut: string; import_etape: string | null }
    >(contenuIds, "Stats du batch", (lot) =>
      supabase
        .from("contenus")
        .select("id, import_statut, statut, import_etape")
        .in("id", lot));
    for (const c of contenus) {
      if (c.import_statut === "done" || c.import_etape === "elo_insuffisant") {
        contenusDone += 1;
      } else {
        contenusPending += 1;
      }
    }
  }
  return {
    total: list.length,
    pending: list.filter((r) => r.statut === "pending").length,
    running: list.filter((r) => r.statut === "running").length,
    done: list.filter((r) => r.statut === "done").length,
    failed: list.filter((r) => r.statut === "failed").length,
    contenusPending,
    contenusDone,
  };
}
