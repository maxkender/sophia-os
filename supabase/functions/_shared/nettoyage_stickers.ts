/**
 * Nettoyage stickers d'un label : quels slideshows déjà importés retirer.
 *
 * Un slideshow est retiré quand une de ses slides porte un sticker PUB (app,
 * marque, site d'un concurrent). Les stickers de contenu (livre, vidéo,
 * article) restent : ils portent la recommandation. Sauf, toujours :
 *   - un contenu de pod (`contenus.pod`, passe-droit) ;
 *   - un contenu au tier A ou mieux, pour Sophia (`contenus.tier`) ou pour une
 *     autre application (`contenu_application_tier_etat`, lignes éligibles) ;
 *   - nos applis (Sophia, UnSwipe, Micabo) : l'OCR ne les compte pas comme
 *     sticker du tout (consigne de `ocrSlideImport`).
 * Retirer = `statut = rejete` : le slideshow sort de toutes les réserves.
 *
 * Le nettoyage est mené par le serveur (migration 0317, fonction
 * `nettoyer-stickers`) ; ce module en garde les décisions pures.
 */

/** Tiers gardés quoi qu'il arrive : A et au-dessus. */
export const TIERS_PROTEGES: ReadonlySet<string> = new Set(["A", "S", "S+"]);

/** Un des tiers (Sophia ou une autre application) vaut A ou mieux. */
export function tierProtege(tiers: ReadonlyArray<string | null | undefined>): boolean {
  return tiers.some((t) => typeof t === "string" && TIERS_PROTEGES.has(t.trim().toUpperCase()));
}

/** Motif écrit sur le contenu retiré (`import_erreur`). */
export function motifRetrait(libelleLabel: string | null): string {
  return `Sticker pub (nettoyage stickers${libelleLabel ? ` du label ${libelleLabel}` : ""}) — retiré`;
}

interface SlideBrute {
  position: number;
  raw_url?: string | null;
  reference_url?: string | null;
}

/** Slides que lit l'OCR d'import : image brute (ou de référence), dans l'ordre. */
export function slidesAvecImage(structure: unknown): Array<{ position: number; url: string }> {
  const slides = (Array.isArray(structure) ? structure : []) as SlideBrute[];
  return slides
    .map((s) => ({ position: Number(s.position), url: s.raw_url ?? s.reference_url ?? "" }))
    .filter((s) => s.url)
    .sort((a, b) => a.position - b.position);
}

export interface SlideAnalysee {
  position: number;
  url: string;
  /** Famille lue par `ocrSlideImport`. */
  sticker: "pub" | "contenu" | null;
  erreur?: string;
}

/**
 * Sticker lu à l'import sur une slide (21/10). Par défaut un sticker pub rejette
 * le TikTok. Pour une source listée dans `reglages.stickers.remplacer_slide_sources`
 * (des comptes qui font la promo d'une appli sur UNE slide de chaque post), la
 * slide promo est gardée : son texte part au placement (c'est là que notre appli
 * prend la place du concurrent) et son image est remplacée par une photo propre
 * du label. Jamais la couverture, et une seule slide par TikTok : au-delà, rejet.
 */
export function decisionStickerImport(args: {
  sticker: "pub" | "contenu" | null;
  /** La source du contenu est dans `remplacer_slide_sources`. */
  remplacable: boolean;
  /** Slide de couverture (le hook). */
  couverture: boolean;
  /** Une autre slide du TikTok est déjà une slide promo remplacée. */
  dejaUne: boolean;
}): "garder" | "remplacer" | "rejeter" {
  if (args.sticker !== "pub") return "garder";
  if (!args.remplacable || args.couverture || args.dejaUne) return "rejeter";
  return "remplacer";
}

/** Passages du drain sur un slideshow dont une slide n'a pas pu être lue. */
export const TENTATIVES_SCAN = 3;

/**
 * Statut d'un slideshow après un passage de l'OCR. Une pub suffit, même si une
 * autre slide n'a pas pu être lue. Sinon, une slide illisible (image pas
 * téléchargée, Gemini indisponible) ne vaut PAS « propre » : le slideshow
 * repasse plus tard, puis finit en erreur, compté à part. C'est ce qui manquait
 * au scan piloté par le navigateur : une slide en erreur y passait pour ✓.
 */
export function statutApresAnalyse(
  slides: ReadonlyArray<SlideAnalysee>,
  tentatives: number,
): { statut: "pub" | "propre" | "a_analyser" | "erreur"; erreur: string | null } {
  if (slides.some((s) => s.sticker === "pub")) return { statut: "pub", erreur: null };
  const enErreur = slides.find((s) => s.erreur);
  if (enErreur) {
    const erreur = `slide ${enErreur.position} : ${enErreur.erreur}`;
    return { statut: tentatives < TENTATIVES_SCAN ? "a_analyser" : "erreur", erreur };
  }
  return { statut: "propre", erreur: null };
}

/** Titre court d'un slideshow pour le journal. */
export function titreCourt(titre: string | null, id: string): string {
  const t = (titre ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > 60 ? `${t.slice(0, 57)}…` : t) : id.slice(0, 8);
}

/** Ligne du journal pour un slideshow analysé. */
export function ligneScan(
  titre: string,
  statut: "pub" | "propre" | "a_analyser" | "erreur",
  slides: ReadonlyArray<SlideAnalysee>,
  erreur: string | null,
): string {
  if (statut === "pub") {
    const pubs = slides.filter((x) => x.sticker === "pub").map((x) => x.position);
    return `✗ PUB slide${pubs.length > 1 ? "s" : ""} ${pubs.join(", ")} — ${titre}`;
  }
  if (statut === "a_analyser") return `↺ ${titre} — ${erreur}, nouvel essai plus tard`;
  if (statut === "erreur") return `⚠ ${titre} — erreur : ${erreur}`;
  return `✓ ${titre}`;
}

/** « tier A ou mieux ×5, pod ×1 » : raisons des slideshows que le serveur a laissés. */
export function resumeIgnores(ignores: ReadonlyArray<{ raison: string }>): string {
  const compte = new Map<string, number>();
  for (const i of ignores) compte.set(i.raison, (compte.get(i.raison) ?? 0) + 1);
  return [...compte].map(([raison, n]) => `${raison} ×${n}`).join(", ");
}

/** Durée en m:ss (ou h:mm:ss au-delà d'une heure). */
export function formatDuree(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Échec de téléchargement de l'image (et non de Gemini, qui réessaie déjà de
 * lui-même) : le Storage refuse au-delà de quelques dizaines de connexions
 * simultanées (« too_many_connections », 429), le cas du scan d'un label.
 */
export function estErreurTelechargement(message: string): boolean {
  return /Téléchargement média|error sending request|connection|network|timed out/i.test(message);
}

/** Rejoue `fn` quand elle échoue sur un téléchargement, avec une attente croissante. */
export async function avecReprise<T>(
  fn: () => Promise<T>,
  essais = 3,
  attendre: (essai: number) => Promise<void> = (k) =>
    new Promise((r) => setTimeout(r, 1500 * k + Math.floor(Math.random() * 1000))),
): Promise<T> {
  for (let essai = 1; ; essai += 1) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (essai >= essais || !estErreurTelechargement(message)) throw error;
      await attendre(essai);
    }
  }
}

/** Traite `items` avec au plus `concurrence` appels en cours ; résultats dans l'ordre. */
export async function enParallele<T, R>(
  items: readonly T[],
  concurrence: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultats = new Array<R>(items.length);
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < items.length) {
      const i = suivant;
      suivant += 1;
      resultats[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrence, items.length)) }, ouvrier));
  return resultats;
}
