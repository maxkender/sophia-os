import {
  downloadImage,
  listerDiaporamas,
  listerPostsProfil,
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
  attacherLabelsAuMedia,
  mediaPropreMemeLabel,
} from "./media_labels.ts";
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
const MAX_TENTATIVES_NETTOYAGE = 4;
/** Apify `resultsPerPage` — on vise tout le profil (plafond acteur). */
const SCRAPE_TOUS = 100;

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

function sophiaParDefaut(langue: string): string {
  const par: Record<string, string> = {
    fr: "Envie d'en apprendre plus chaque jour ? L'appli Sophia t'apprend une culture générale de dingue en quelques minutes. Teste-la 👀",
    en: "Want to learn something new every day? The Sophia app teaches you wild general knowledge in minutes. Give it a try 👀",
    es: "¿Quieres aprender algo nuevo cada día? La app Sophia te enseña cultura general increíble en minutos. Pruébala 👀",
    de: "Lust, jeden Tag etwas Neues zu lernen? Die Sophia-App bringt dir in wenigen Minuten richtig gutes Allgemeinwissen bei. Probier's aus 👀",
    it: "Vuoi imparare qualcosa di nuovo ogni giorno? L'app Sophia ti insegna una cultura generale pazzesca in pochi minuti. Provala 👀",
    pt: "Queres aprender algo novo todos os dias? A app Sophia ensina-te cultura geral incrível em poucos minutos. Experimenta 👀",
    cs: "Chceš se každý den naučit něco nového? Aplikace Sophia tě naučí skvělé všeobecné znalosti za pár minut. Vyzkoušej ji 👀",
    nl: "Wil je elke dag iets nieuws leren? De Sophia-app leert je in een paar minuten waanzinnige algemene kennis. Probeer het 👀",
    el: "Θέλεις να μαθαίνεις κάτι νέο κάθε μέρα; Η εφαρμογή Sophia σου μαθαίνει απίστευτη γενική γνώση σε λίγα λεπτά. Δοκίμασέ την 👀",
    hu: "Szeretnél minden nap valami újat tanulni? A Sophia app perceken belül vad általános műveltséget ad. Próbáld ki 👀",
    pl: "Chcesz codziennie uczyć się czegoś nowego? Aplikacja Sophia uczy szalonej wiedzy ogólnej w kilka minut. Wypróbuj 👀",
    ro: "Vrei să înveți ceva nou în fiecare zi? Aplicația Sophia te învață cultură generală tare în câteva minute. Încearc-o 👀",
    sv: "Vill du lära dig något nytt varje dag? Sophia-appen lär dig galen allmänbildning på några minuter. Testa den 👀",
    tr: "Her gün yeni bir şey öğrenmek ister misin? Sophia uygulaması dakikalar içinde efsane genel kültür öğretir. Dene 👀",
  };
  return par[langue] ?? par.en;
}

const idDe = (url: string) => url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;

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
    /** Poids des vues dans la base ELO (reste = pertinence). Défaut 90 %. */
    poidsVues: v.elo_poids_vues ?? 0.9,
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
  const poidsVues = Math.min(1, Math.max(0, opts.poidsVues ?? 0.9));
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

/** Rapport ELO pour toutes les langues cibles — texte prêt pour les logs. */
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
  const lignes = LANGUES_CIBLES.map((langue) =>
    decomposerElo({ ...opts, langue, seuil: opts.seuil }),
  );
  const head = lignes[0]!;
  const pctVues = Math.round(opts.poidsVues * 100);
  const pctPert = 100 - pctVues;
  const texte = [
    `vues=${head.vues} → scoreVues=${head.vuesScore.toFixed(2)} (log^1.3, plafond ${opts.vuesPlafond})`,
    `pertinence=${head.pertinence}`,
    `base = ${pctPert}%×pert + ${pctVues}%×vues = ${((1 - opts.poidsVues) * head.pertinence + opts.poidsVues * head.vuesScore).toFixed(2)}`,
    `régularisation ELO: prior=${opts.prior} k=${opts.k} · seuil=${opts.seuil} · source=${opts.langueSource}`,
    `kk = k/2 si langue source, sinon 2k · ELO = (kk×prior + base) / (kk+1)`,
    ...lignes.map((l) => {
      const flag = l.retenue ? "✓ retenue" : "✗ sous seuil";
      const src = l.estSource ? " · SOURCE" : "";
      return (
        `  ${l.langue}: base=${l.base.toFixed(2)} kk=${l.kk}` +
        ` → ELO=${l.elo.toFixed(2)} ${flag}${src}`
      );
    }),
  ].join("\n");

  return {
    vues: head.vues,
    pertinence: head.pertinence,
    vuesScore: head.vuesScore,
    poidsVues: opts.poidsVues,
    vuesPlafond: opts.vuesPlafond,
    prior: opts.prior,
    k: opts.k,
    seuil: opts.seuil,
    langueSource: opts.langueSource,
    lignes: lignes.map(({ poidsVues: _p, vuesPlafond: _v, vues: _u, ...l }) => l),
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
): Promise<{ id: string } | null> {
  const { data: exact } = await supabase
    .from("contenus")
    .select("id")
    .eq("source_url", postUrl)
    .maybeSingle();
  if (exact) return exact;

  const pid = idDe(postUrl);
  if (!pid || pid === postUrl) return null;
  // Variantes /photo/ vs /video/ : match sur l'id TikTok.
  const { data: approx } = await supabase
    .from("contenus")
    .select("id, source_url")
    .or(`source_url.ilike.%/photo/${pid}%,source_url.ilike.%/video/${pid}%`)
    .limit(1)
    .maybeSingle();
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

/** Crée un contenu depuis un post scrapé (idempotent sur source_url). */
export async function creerContenuDepuisPost(
  supabase: Supabase,
  post: ScrapedPost,
  compteReferenceId: string | null,
  labelIds: string[] | null = null,
  langueSource = "fr",
): Promise<{ id: string; reused: boolean }> {
  const existant = await trouverContenuParUrl(supabase, post.webVideoUrl);
  if (existant) {
    await reouvrirContenuPourReimport(
      supabase,
      existant.id,
      post,
      compteReferenceId,
      labelIds,
      langueSource,
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
 * Crée les `contenu_langues` pour les langues ELO ≥ seuil (+ toujours la
 * langue source, deck de base pour traduire plus tard à l'assignation).
 * Renvoie les langues ≥ seuil (vide = TikTok non importé / rejeté).
 * Ne touche pas aux lignes déjà présentes (stocks existants).
 */
export async function assurerLanguesAuDessusSeuilElo(
  supabase: Supabase,
  contenuId: string,
  langueSource: string,
  vuesSource: number | null,
  pertinence: number,
): Promise<string[]> {
  const scoring = await lireScoring(supabase);
  const { data: existantes } = await supabase
    .from("contenu_langues")
    .select("langue, score")
    .eq("contenu_id", contenuId);
  if ((existantes ?? []).length > 0) {
    // Stock déjà en place : on ne reconstruit pas.
    return (existantes ?? [])
      .filter((r) => Number(r.score) >= scoring.eloSeuil)
      .map((r) => r.langue as string);
  }

  const calculees = LANGUES_CIBLES.map((langue) => ({
    contenu_id: contenuId,
    langue,
    slides: [] as SlideLangue[],
    score: eloParLangue({
      pertinence,
      vues: vuesSource,
      langue,
      langueSource,
      prior: scoring.prior,
      k: scoring.k,
      poidsVues: scoring.poidsVues,
      vuesPlafond: scoring.vuesPlafond,
    }),
    nb_passages: 0,
    score_maj_at: new Date().toISOString(),
  }));

  const retenues = calculees.filter((r) => r.score >= scoring.eloSeuil);
  if (retenues.length === 0) return [];

  // Langue source toujours présente (deck OCR / base de traduction), même si
  // son ELO est sous le seuil — les autres langues ≥ seuil restent vides jusqu'à
  // l'assignation minuit.
  const parLangue = new Map(retenues.map((r) => [r.langue, r]));
  const source = calculees.find((r) => r.langue === langueSource);
  if (source && !parLangue.has(langueSource)) parLangue.set(langueSource, source);

  const { error } = await supabase.from("contenu_langues").insert([...parLangue.values()]);
  if (error) throw error;
  return retenues.map((r) => r.langue);
}

/** Import d'un lien TikTok isolé. */
export async function importerLien(
  supabase: Supabase,
  postUrl: string,
  compteReferenceId: string | null,
  labelIds: string[] | null,
): Promise<{ id: string; reused: boolean }> {
  const [post] = await scrapePost(postUrl);
  if (!post) throw new Error("Post introuvable ou non scrapable");
  if (post.imageUrls.length === 0) throw new Error("Pas un diaporama (aucune image)");

  let langue = "fr";
  if (compteReferenceId) {
    const { data: ref } = await supabase
      .from("comptes_reference")
      .select("langue")
      .eq("id", compteReferenceId)
      .maybeSingle();
    langue = ref?.langue ?? "fr";
  }
  return creerContenuDepuisPost(supabase, post, compteReferenceId, labelIds, langue);
}

/**
 * Liste les URLs de diaporamas à importer pour un compte (sans scraper les
 * visuels). Le client lance ensuite 1 agent scrapePost par URL en parallèle.
 */
export async function listerUrlsCompteReference(
  supabase: Supabase,
  compteReferenceId: string,
): Promise<{
  handle: string;
  urls: string[];
  total: number;
  connus: number;
  source: "page" | "apify" | "mixte";
}> {
  const { data: ref } = await supabase
    .from("comptes_reference")
    .select("id, handle_tiktok")
    .eq("id", compteReferenceId)
    .single();
  if (!ref) throw new Error("Compte de référence introuvable");

  const handle = String(ref.handle_tiktok).replace(/^@/, "");
  const { data: connusContenu } = await supabase
    .from("contenus")
    .select("source_url")
    .not("source_url", "is", null);
  const deja = new Set((connusContenu ?? []).map((s) => idDe(s.source_url ?? "")));

  const vues = new Map<string, number>();
  let source: "page" | "apify" | "mixte" = "page";
  const urlsSet = new Set<string>();

  // 1) Page publique TikTok (gratuit, rapide) — IDs photo uniquement.
  try {
    for (const u of await listerDiaporamas(handle)) urlsSet.add(u);
  } catch {
    // on retombe sur Apify ci-dessous
  }

  // 2) Apify profil sans télécharger les images — complète / ordonne par vues.
  //    Chaque slideshow sera re-scrapé individuellement ensuite (1 agent / post).
  try {
    const posts = await listerPostsProfil(handle, SCRAPE_TOUS);
    if (posts.length > 0) {
      source = urlsSet.size > 0 ? "mixte" : "apify";
      for (const p of posts) {
        if (!p.webVideoUrl) continue;
        const estPhoto =
          p.imageUrls.length > 0 ||
          /\/photo\//.test(p.webVideoUrl) ||
          urlsSet.has(p.webVideoUrl);
        if (!estPhoto) continue;
        urlsSet.add(p.webVideoUrl);
        vues.set(idDe(p.webVideoUrl), p.stats?.vues ?? 0);
      }
    }
  } catch {
    // Si Apify cale, on garde la liste page seule.
  }

  // Tous les slideshows (inédits + déjà connus) : les connus seront réouverts
  // sur le même contenu (re-pipeline, historique Passages conservé).
  const toutes = [...urlsSet].sort(
    (a, b) => (vues.get(idDe(b)) ?? 0) - (vues.get(idDe(a)) ?? 0),
  );
  const connus = toutes.filter((u) => deja.has(idDe(u))).length;

  await supabase
    .from("comptes_reference")
    .update({ dernier_scrape_at: new Date().toISOString() })
    .eq("id", compteReferenceId);

  return {
    handle,
    urls: toutes,
    total: toutes.length,
    connus,
    source,
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
  const listed = await listerUrlsCompteReference(supabase, compteReferenceId);
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

export interface AvancerImportResultat {
  etape: string;
  /** Présent sur les étapes elo / elo_insuffisant. */
  elo?: EloRapport;
  /** Présent sur l'étape nettoyage. */
  nettoyage?: NettoyageRapport;
}

/**
 * Avance le pipeline d'UN pas. Ordre :
 * OCR hook → pertinence → OCR reste → ELO par langue (gate) → nettoyage (1×)
 * → valide (texte OCR source uniquement).
 *
 * Sophia + traduction hors-source = à l'assignation minuit
 * (`assurerDeckPourLangue`), pas à l'import.
 */
// deno-lint-ignore no-explicit-any
export async function avancerImport(
  supabase: Supabase,
  contenu: any,
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
      return { etape: "ocr" };
    }

    // 2 — Pertinence (métrique ELO ; pas de rejet dur ici)
    if (contenu.pertinence_score === null || contenu.pertinence_score === undefined) {
      const { score, reason } = await scoreRelevance({
        caption: contenu.titre ?? "",
        hookText: slides[0]?.texte_original ?? "",
        instructions: await chargerPrompt(supabase, "pertinence"),
      });
      await marquer(supabase, contenu.id, {
        pertinence_score: score,
        pertinence_raison: reason,
        statut: "brouillon",
        import_etape: "pertinence",
      });
      return { etape: "pertinence" };
    }

    if (contenu.statut === "rejete") {
      await marquer(supabase, contenu.id, { import_statut: "done", import_etape: "rejete" });
      return { etape: "rejete" };
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
      return { etape: "ocr" };
    }

    // 4 — ELO par langue → ne garde que les langues ≥ seuil
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

      const retenues = await assurerLanguesAuDessusSeuilElo(
        supabase,
        contenu.id,
        langueSource,
        contenu.vues_source ?? null,
        Number(contenu.pertinence_score ?? 0),
      );
      if (retenues.length === 0) {
        await marquer(supabase, contenu.id, {
          statut: "rejete",
          import_statut: "done",
          import_etape: "elo_insuffisant",
          import_erreur: "Aucune langue avec ELO au-dessus du seuil — TikTok non importé",
          import_elo_rapport: elo,
        });
        return { etape: "elo_insuffisant", elo };
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
          contenu.import_etape !== "traduction" && contenu.import_etape !== "sophia" &&
          contenu.import_etape !== "done") {
        await marquer(supabase, contenu.id, { import_etape: "elo" });
        return { etape: "elo", elo };
      }
    }

    // 5 — Nettoyage image UNE fois (language-agnostique)
    const aNettoyer = slides.filter((s) => !s.media_id);
    if (aNettoyer.length > 0) {
      const rapports: NettoyageSlideRapport[] = [];
      for (const slide of aNettoyer.slice(0, SLIDES_PAR_PASSAGE)) {
        const r = await nettoyerSlide(supabase, contenu, slide);
        rapports.push(r.rapport);
        if (r.mediaId) {
          slide.media_id = r.mediaId;
          slide.tentatives = undefined;
        } else {
          // Texte encore là (verifyClean) ou Fal/Replicate KO → biblio même label.
          const remplace = await tenterRemplacementLabel(
            supabase,
            contenu,
            slides,
            r.rapport,
          );
          if (remplace) {
            slide.media_id = remplace;
            slide.tentatives = undefined;
          } else {
            slide.tentatives = (slide.tentatives ?? 0) + 1;
            if (slide.tentatives >= MAX_TENTATIVES_NETTOYAGE) {
              slide.media_id = await stockerBrut(supabase, contenu, slide);
              r.rapport.lignes.push(
                `→ brut stocké après ${slide.tentatives} échecs (plus de retry)`,
              );
              r.rapport.motif = "brut après max tentatives";
            } else {
              r.rapport.lignes.push(
                `→ retry prévu (${slide.tentatives}/${MAX_TENTATIVES_NETTOYAGE})`,
              );
            }
          }
        }
        await marquer(supabase, contenu.id, {
          structure_slides: slides,
          import_etape: "nettoyage",
        });
      }
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
      return { etape: "nettoyage", nettoyage };
    }

    // 6 — Recalcule ELO cold-start puis valide.
    // Texte stocké = OCR source uniquement (pas de pub Sophia, pas de trad).
    // Sophia + traduction hors-source → `assurerDeckPourLangue` à l'assignation.
    const { data: langues } = await supabase
      .from("contenu_langues")
      .select("id, langue, slides, score")
      .eq("contenu_id", contenu.id);

    const scoring = await lireScoring(supabase);
    const forcerSeuil = Boolean(contenu.import_elo_force_seuil);
    for (const l of langues ?? []) {
      let score = eloParLangue({
        pertinence: Number(contenu.pertinence_score ?? 0),
        vues: contenu.vues_source,
        langue: l.langue,
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
        .eq("id", l.id);
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
    return { etape: "done" };
  } catch (error) {
    await marquer(supabase, contenu.id, {
      import_statut: "failed",
      import_erreur: messageErreur(error),
    });
    return { etape: "failed" };
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

  const placement = await integrateSophia({
    masterPrompt: (await chargerPrompt(supabase, "placement_sophia")) ?? "",
    corrections: (corrections ?? []).map((c) => ({
      original_text: c.texte_origine,
      corrected_text: c.texte_corrige,
    })),
    slides: deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
    caption: contenu.titre ?? "",
    langue,
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
 */
export async function assurerDeckPourLangue(
  supabase: Supabase,
  contenuId: string,
  langue: string,
): Promise<SlideLangue[]> {
  const { data: contenu } = await supabase
    .from("contenus")
    .select("id, titre, langue_source, compte_reference_id, structure_slides")
    .eq("id", contenuId)
    .single();
  if (!contenu) throw new Error("Contenu introuvable");

  const { data: cl } = await supabase
    .from("contenu_langues")
    .select("id, langue, slides")
    .eq("contenu_id", contenuId)
    .eq("langue", langue)
    .maybeSingle();
  if (!cl) throw new Error(`Langue ${langue} non éligible (pas de ligne ELO)`);

  let deck = [...((cl.slides ?? []) as SlideLangue[])];
  const pret =
    deck.length > 0 &&
    deck.some((s) => s.texte_overlay) &&
    deck.some((s) => s.position_sophia);
  if (pret) return deck;

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
    const parPos = new Map(traductions.map((t) => [t.position, t.translated]));
    deck = deckSource.map((s) => ({
      position: s.position,
      texte_overlay: parPos.get(s.position) ?? "",
      position_sophia: false,
    }));
    await supabase.from("contenu_langues").update({ slides: deck }).eq("id", cl.id);
  }

  if (!deck.some((s) => s.position_sophia)) {
    const r = await placerSophiaSurDeck(supabase, contenu, cl.id, deck, langue);
    if (r === "retry") {
      const derniere = deck[deck.length - 1];
      if (derniere) {
        derniere.texte_overlay = sophiaParDefaut(langue);
        derniere.position_sophia = true;
        await supabase.from("contenu_langues").update({ slides: deck }).eq("id", cl.id);
      }
    }
  }

  const { data: frais } = await supabase
    .from("contenu_langues")
    .select("slides")
    .eq("id", cl.id)
    .single();
  return (frais?.slides ?? deck) as SlideLangue[];
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

/** Stocke le résultat Fal/Replicate. verifyClean est en pause (pas d'appel Gemini). */
async function nettoyerSlide(
  supabase: Supabase,
  contenu: any,
  slide: SlideBrut,
): Promise<{ mediaId: string | null; rapport: NettoyageSlideRapport }> {
  const labelEtape: Record<string, string> = {
    text_removal: "① Fal",
    replicate_text_removal: "② FALLBACK Replicate",
    c2pa: "③ Enlève clés C2PA",
    ready: "④ Ready",
  };
  const lignes: string[] = [
    `slide #${slide.position} · url=${(slide.raw_url ?? "").slice(0, 72)}…`,
    `pipeline: ① Fal → ② Replicate → ③ C2PA → ④ stockage (verifyClean PAUSE)`,
  ];
  const rapport: NettoyageSlideRapport = {
    position: slide.position,
    ok: false,
    lignes,
  };

  await prolongerLease(supabase, contenu.id);

  let propreBase64: string | null = null;
  let moteur: string | undefined;
  let mimeDeclare = "image/jpeg";
  try {
    const propre = await cleanImage(slide.raw_url, (e) => {
      const nom = labelEtape[e.etape] ?? e.etape;
      const line = `${nom} · ${e.statut}${e.detail ? ` — ${e.detail}` : ""}`;
      if (
        e.etape === "text_removal" &&
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
    });
    propreBase64 = propre?.base64 ?? null;
    moteur = propre?.moteur;
    mimeDeclare = propre?.mime ?? "image/jpeg";
    rapport.moteur = moteur;
  } catch (error) {
    const msg = messageErreur(error);
    lignes.push(`exception: ${msg}`);
    rapport.motif = msg;
    console.warn(
      `[import nettoyage] contenu=${contenu.id} slide=${slide.position} ${msg}`,
    );
    return { mediaId: null, rapport };
  }

  await prolongerLease(supabase, contenu.id);

  if (!propreBase64) {
    rapport.motif = "aucune image renvoyée";
    lignes.push("échec: aucune image après Fal + fallbacks");
    return { mediaId: null, rapport };
  }

  const { mime, ext } = mimeDepuisBase64(propreBase64, mimeDeclare);
  const path = `propre/${contenu.id}/${slide.position}.${ext}`;
  const bytes = Uint8Array.from(atob(propreBase64), (c) => c.charCodeAt(0));
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      upsert: true,
      cacheControl: "60",
    });
  if (upErr) throw upErr;
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const url = `${publicUrl}?v=${Date.now()}`;

  const { data: media, error } = await supabase
    .from("media_library")
    .upsert(
      {
        compte_reference_id: contenu.compte_reference_id,
        contenu_id: contenu.id,
        storage_path: path,
        url,
        source: "nettoye_reference",
        langue: contenu.langue_source,
        visage_identifiable: null,
        verifie_le: new Date().toISOString(),
        texte_restant: false,
      },
      { onConflict: "storage_path" },
    )
    .select("id")
    .single();
  if (error) throw error;
  const labels = await attacherLabelsAuMedia(supabase, media.id, contenu.id);
  rapport.ok = true;
  lignes.push(
    `upload OK → media_id=${media.id} · moteur=${moteur ?? "?"}` +
      (labels.length ? ` · labels=${labels.length}` : ""),
  );
  return { mediaId: media.id, rapport };
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
      .order("pertinence_score", { ascending: true, nullsFirst: true })
      .order("created_at");
  }

  const { data } = await query.limit(1);
  return data?.[0] ?? null;
}

/** Fal peut prendre ~2 min/slide × 2 slides — lease court → double worker écrase le résultat. */
const LEASE_MS = 8 * 60_000;

/** Claim atomique d'un contenu libre (lease) pour workers parallèles. */
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
  batch_id: string | null;
  statut: string;
  contenu_id: string | null;
  erreur: string | null;
  tentatives: number;
}

/** Enfile des URLs pour scrape+pipeline serveur (idempotent sur pending/running). */
export async function enqueueImportUrls(
  supabase: Supabase,
  opts: {
    urls: string[];
    compteReferenceId: string | null;
    labelIds?: string[] | null;
    batchId?: string | null;
  },
): Promise<{ batchId: string; enqueued: number; skipped: number }> {
  const batchId = opts.batchId ?? crypto.randomUUID();
  let enqueued = 0;
  let skipped = 0;
  for (const url of opts.urls) {
    const { error } = await supabase.from("import_file").insert({
      post_url: url,
      compte_reference_id: opts.compteReferenceId,
      label_ids: opts.labelIds ?? [],
      batch_id: batchId,
      statut: "pending",
    });
    if (error) {
      // Unique pending/running sur post_url → déjà en file
      skipped += 1;
      continue;
    }
    enqueued += 1;
  }
  return { batchId, enqueued, skipped };
}

/** Claim d'une ligne import_file libre. */
export async function claimImportFile(
  supabase: Supabase,
): Promise<ImportFileRow | null> {
  const now = new Date().toISOString();
  const libre = `lease_until.is.null,lease_until.lt."${now}"`;
  const { data: candidats } = await supabase
    .from("import_file")
    .select("id")
    .in("statut", ["pending", "failed"])
    .lt("tentatives", 5)
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

/** Scrape une URL en file → crée/réouvre le contenu (pipeline ensuite via claimContenu). */
export async function traiterImportFile(
  supabase: Supabase,
  row: ImportFileRow,
): Promise<{ ok: boolean; contenuId?: string; erreur?: string }> {
  try {
    const cree = await importerLien(
      supabase,
      row.post_url,
      row.compte_reference_id,
      row.label_ids?.length ? row.label_ids : null,
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
 * Relance un import rejeté pour ELO insuffisant : planche chaque score au seuil,
 * crée les `contenu_langues`, remet le pipeline en file (nettoyage → valide).
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

  const lignesForcees = eloBase.lignes.map((l) => {
    const elo = Math.max(l.elo, scoring.eloSeuil);
    return { ...l, elo, retenue: true };
  });
  const elo: EloRapport = {
    ...eloBase,
    lignes: lignesForcees,
    texte: [
      `FORCÉ manuellement → ELO plancher = seuil (${scoring.eloSeuil})`,
      eloBase.texte,
      ...lignesForcees.map((l) => {
        const natif = eloBase.lignes.find((x) => x.langue === l.langue);
        const avant = natif?.elo.toFixed(2) ?? "?";
        return `  ${l.langue}: ${avant} → ${l.elo.toFixed(2)} (forcé ≥ seuil)`;
      }),
    ].join("\n"),
  };

  // Remplace les lignes langues éventuelles (souvent absentes si rejet ELO).
  await supabase.from("contenu_langues").delete().eq("contenu_id", contenuId);

  const rows = lignesForcees.map((l) => ({
    contenu_id: contenuId,
    langue: l.langue,
    slides: [] as SlideLangue[],
    score: l.elo,
    nb_passages: 0,
    score_maj_at: new Date().toISOString(),
  }));
  const { error: insErr } = await supabase.from("contenu_langues").insert(rows);
  if (insErr) return { ok: false, erreur: insErr.message };

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

  return { ok: true, elo, langues: lignesForcees.map((l) => l.langue) };
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
    const { data: contenus } = await supabase
      .from("contenus")
      .select("id, import_statut, statut, import_etape")
      .in("id", contenuIds);
    for (const c of contenus ?? []) {
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
