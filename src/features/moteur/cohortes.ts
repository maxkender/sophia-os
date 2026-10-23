/**
 * Cohortes du lundi (page Posters, 21/10) : un posteur appartient à la semaine
 * où il a démarré, celle de son premier post prévu sur le premier de ses
 * comptes. Même jour 0 que Check, Kill or Double (`comptes_premier_jour`,
 * 0333). Un compte sans encore aucun post (warm-up en cours) prend le lundi de
 * fin de son warm-up : c'est la cohorte à venir. Un posteur doublé ou recréé
 * reste dans sa cohorte d'origine ; chaque compte garde son propre lundi.
 *
 * Les posteurs d'avant la règle du lundi (0301) ont parfois démarré un autre
 * jour : on prend le lundi de cette semaine-là.
 */
import { partiesParis } from "@/features/onboarding/datesRuul";
import { lundiDe } from "@/features/moteur/semaines";

/** Clé du filtre pour les posteurs sans aucun compte lancé. */
export const COHORTE_PAS_DEMARRE = "pas-demarre";

export type TriPosters = "phase" | "cohorte_recente" | "cohorte_ancienne" | "nom";
export const TRIS_POSTERS: readonly TriPosters[] = ["phase", "cohorte_recente", "cohorte_ancienne", "nom"];

/**
 * Lundi (AAAA-MM-JJ) de départ d'un compte : celui de son premier post prévu,
 * sinon celui de la fin de son warm-up (lundi 00 h, Paris). `null` : warm-up
 * pas lancé.
 */
export function lundiDepartCompte(
  premierJour: string | null | undefined,
  warmupEndsAt: string | null | undefined,
): string | null {
  if (premierJour) return lundiDe(premierJour.slice(0, 10));
  if (warmupEndsAt) {
    const fin = new Date(warmupEndsAt);
    if (!Number.isNaN(fin.getTime())) return lundiDe(partiesParis(fin).date);
  }
  return null;
}

/** Cohorte d'un posteur : le plus ancien lundi de ses comptes, `null` sans aucun. */
export function cohortePosteur(lundis: ReadonlyArray<string | null>): string | null {
  const dates = lundis.filter((l): l is string => Boolean(l)).sort();
  return dates[0] ?? null;
}

/**
 * Semaine du posteur dans son parcours : 1 la semaine de son lundi, 2 la
 * suivante… 0 ou moins : cohorte à venir.
 */
export function semaineDansCohorte(lundi: string, aujourdhui: string): number {
  const ecart = Date.parse(`${lundiDe(aujourdhui)}T12:00:00Z`) - Date.parse(`${lundi}T12:00:00Z`);
  return Math.round(ecart / (7 * 86_400_000)) + 1;
}

/** Numéro de semaine ISO d'un lundi (« S43 »). */
export function semaineIso(lundi: string): number {
  const d = new Date(`${lundi}T12:00:00Z`);
  const jeudi = new Date(d);
  jeudi.setUTCDate(d.getUTCDate() + 3);
  const premierJanvier = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 1, 12));
  return Math.floor((jeudi.getTime() - premierJanvier.getTime()) / (7 * 86_400_000)) + 1;
}

/** Les cohortes présentes, de la plus récente à la plus ancienne, puis « pas démarré ». */
export function optionsCohortes(cohortes: ReadonlyArray<string | null>): { cle: string; n: number }[] {
  const n = new Map<string, number>();
  for (const c of cohortes) {
    const cle = c ?? COHORTE_PAS_DEMARRE;
    n.set(cle, (n.get(cle) ?? 0) + 1);
  }
  const lundis = [...n.keys()].filter((k) => k !== COHORTE_PAS_DEMARRE).sort().reverse();
  return [
    ...lundis.map((cle) => ({ cle, n: n.get(cle)! })),
    ...(n.has(COHORTE_PAS_DEMARRE) ? [{ cle: COHORTE_PAS_DEMARRE, n: n.get(COHORTE_PAS_DEMARRE)! }] : []),
  ];
}

/**
 * Ordre de deux cohortes pour un tri. Les posteurs pas démarrés passent
 * toujours en dernier ; `recente` met les lundis les plus récents d'abord.
 */
export function comparerCohortes(a: string | null, b: string | null, recente: boolean): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return recente ? b.localeCompare(a) : a.localeCompare(b);
}

/** Aujourd'hui, jour de Paris (le jour métier de l'OS). */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  return partiesParis(maintenant).date;
}
