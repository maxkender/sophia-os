/**
 * La performance d'une source : le r médian de ses slideshows (vue
 * `source_performance`, 0356). Même r que la page Pods : vues d'un post ÷ vues
 * médianes du compte qui l'a publié, posts publiés il y a 3 à 30 jours, hors
 * rappels. Sert à décider de mettre à jour une source ou non.
 */

export interface PerfSource {
  /** Posts mesurés (avec un r) sur la fenêtre. */
  posts: number;
  r: number | null;
  vuesMediane: number | null;
}

/** Sous ce nombre de posts, le r est indicatif. */
export const POSTS_MIN_R = 10;

export type TonPerf = "bon" | "moyen" | "faible" | "incertain" | "aucun";

/** Au-dessus de 1,1 la source fait mieux que d'habitude, sous 0,9 moins bien. */
export function tonPerf(perf: PerfSource | undefined): TonPerf {
  if (!perf || perf.r === null || perf.posts === 0) return "aucun";
  if (perf.posts < POSTS_MIN_R) return "incertain";
  if (perf.r >= 1.1) return "bon";
  if (perf.r < 0.9) return "faible";
  return "moyen";
}

/** Une source qui marche : assez de posts et un r d'au moins 1. */
export function sourcePerformante(perf: PerfSource | undefined): boolean {
  return !!perf && perf.r !== null && perf.posts >= POSTS_MIN_R && perf.r >= 1;
}
