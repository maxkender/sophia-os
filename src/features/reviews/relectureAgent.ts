/**
 * Relecture automatique d'un post publié, telle que l'écrit la fonction
 * `relecture-auto` (cron de 3 h, posts de la veille) dans `relectures_auto`.
 * La file de reviews l'affiche pour le post en cours et propose de reprendre
 * son brouillon.
 */
import { normaliserRemarquesReview, type ReviewRemarqueUtilisee } from "./fileJour";

export type StatutRelecture =
  | "a_scraper"
  | "scrape"
  | "a_analyser"
  | "analyse"
  | "fait"
  | "ignore"
  | "echec";

export interface DefautRelecture {
  code: string;
  /** « remarque » : peut partir dans la review ; « info » : pour l'admin seulement. */
  niveau: "remarque" | "info";
  slides: number[];
  /** Phrase courte en français, pour l'admin. */
  detail: string;
}

export interface RelectureAuto {
  post_id: string;
  statut: StatutRelecture;
  /** Du plus important au moins important (trié par la fonction). */
  defauts: DefautRelecture[];
  /** Review proposée, en anglais ; null quand il n'y a rien à envoyer. */
  brouillon: string | null;
  /** Remarques-types couvertes par le brouillon (compteur par créateur, vidéos tuto). */
  remarques: ReviewRemarqueUtilisee[];
  erreur: string | null;
}

/** Relecture terminée, avec ou sans review : plus besoin de rappeler l'agent. */
export function relectureFinie(r: Pick<RelectureAuto, "statut">): boolean {
  return r.statut === "fait" || r.statut === "ignore" || r.statut === "echec";
}

/** Au plus autant de points par review : même règle que `_shared/relecture.ts`. */
export const MAX_POINTS_REVIEW = 2;

const STATUTS: StatutRelecture[] = ["a_scraper", "scrape", "a_analyser", "analyse", "fait", "ignore", "echec"];

function normaliserDefauts(raw: unknown): DefautRelecture[] {
  if (!Array.isArray(raw)) return [];
  const out: DefautRelecture[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    if (typeof d.code !== "string" || !d.code) continue;
    out.push({
      code: d.code,
      niveau: d.niveau === "info" ? "info" : "remarque",
      slides: Array.isArray(d.slides) ? d.slides.filter((s): s is number => typeof s === "number") : [],
      detail: typeof d.detail === "string" ? d.detail.trim() : "",
    });
  }
  return out;
}

/** Ligne brute de `relectures_auto` → relecture propre (null si inutilisable). */
export function normaliserRelecture(row: Record<string, unknown>): RelectureAuto | null {
  const postId = typeof row.post_id === "string" ? row.post_id : "";
  const statut = STATUTS.find((s) => s === row.statut);
  if (!postId || !statut) return null;
  const brouillon = typeof row.brouillon === "string" ? row.brouillon.trim() : "";
  return {
    post_id: postId,
    statut,
    defauts: normaliserDefauts(row.defauts),
    brouillon: brouillon || null,
    remarques: normaliserRemarquesReview(row.remarques),
    erreur: typeof row.erreur === "string" && row.erreur.trim() ? row.erreur.trim() : null,
  };
}

/**
 * Ce qui part dans la review (les premiers points), ce qui attend la suivante,
 * et les notes réservées à l'admin.
 */
export function repartirDefauts(defauts: DefautRelecture[]): {
  review: DefautRelecture[];
  plusTard: DefautRelecture[];
  notes: DefautRelecture[];
} {
  const remarques = defauts.filter((d) => d.niveau === "remarque");
  return {
    review: remarques.slice(0, MAX_POINTS_REVIEW),
    plusTard: remarques.slice(MAX_POINTS_REVIEW),
    notes: defauts.filter((d) => d.niveau === "info"),
  };
}

/** « slide 1 », « slides 5 et 6 », « slides 1, 3 et 4 ». */
export function slidesEnFrancais(slides: number[]): string {
  if (slides.length === 0) return "";
  if (slides.length === 1) return `slide ${slides[0]}`;
  return `slides ${slides.slice(0, -1).join(", ")} et ${slides[slides.length - 1]}`;
}

/** Ligne affichée à l'admin : le constat, puis les slides concernées. */
export function libelleDefaut(d: DefautRelecture): string {
  const texte = d.detail ? d.detail.charAt(0).toUpperCase() + d.detail.slice(1) : d.code;
  const slides = slidesEnFrancais(d.slides);
  return slides ? `${texte} (${slides})` : texte;
}
