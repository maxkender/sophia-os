/**
 * Calculs du Pilotage, à part de la page pour être testés sans rendu.
 */
import type { PilotageDashboard } from "./api";

/** Sous ce stock, un label s'affiche en rouge et part dans « À faire » (même seuil que l'Allocation). */
export const SEUIL_STOCK_JOURS = 7;

/** Combien de relevés précédents servent de référence au dernier. */
const RELEVES_REFERENCE = 7;

export interface ResumeVues {
  jour: string;
  delta: number;
  /** Moyenne des relevés d'avant ; `null` sans historique. */
  reference: number | null;
  /** Écart relatif au relevé de référence (0,18 = +18 %) ; `null` si la référence est nulle ou absente. */
  ecart: number | null;
}

/** Le dernier relevé de vues, comparé à la moyenne des 7 précédents. */
export function resumeVues(serie: PilotageDashboard["vuesSerie"]): ResumeVues | null {
  const avecDelta = serie.filter((s) => s.vues_delta !== null);
  const dernier = avecDelta[avecDelta.length - 1];
  if (!dernier) return null;
  const avant = avecDelta.slice(-1 - RELEVES_REFERENCE, -1).map((s) => s.vues_delta as number);
  const reference = avant.length ? avant.reduce((a, b) => a + b, 0) / avant.length : null;
  return {
    jour: dernier.jour,
    delta: dernier.vues_delta as number,
    reference,
    ecart: reference && reference > 0 ? (dernier.vues_delta as number) / reference - 1 : null,
  };
}

export interface TauxPublication {
  prevus: number;
  publies: number;
  /** 0–1 ; `null` quand rien n'était prévu. */
  taux: number | null;
  /** Le taux jour par jour, pour la mini-tendance. */
  tendance: Array<number | null>;
}

/** Les posts d'hier (dernier jour de la série) et le taux des jours d'avant. */
export function tauxPublication(jours: PilotageDashboard["postsJours"]): TauxPublication {
  const hier = jours[jours.length - 1] ?? { prevus: 0, publies: 0 };
  return {
    prevus: hier.prevus,
    publies: hier.publies,
    taux: hier.prevus > 0 ? hier.publies / hier.prevus : null,
    tendance: jours.map((j) => (j.prevus > 0 ? j.publies / j.prevus : null)),
  };
}

export interface LigneStock {
  label_id: string;
  nom: string;
  jours: number;
  comptes: number;
}

/**
 * Le stock des labels d'une application, du plus court au plus long. Un label
 * sans compte n'a pas de stock mesurable : il sort du tableau et part dans
 * `dormants`, pour ne pas passer pour un label à sec.
 */
export function lignesStock(
  reserves: ReadonlyArray<{ label_id: string; nom: string; comptes: number; reserve_jours: number | null }>,
  labelsVisibles: ReadonlySet<string> | null,
): { lignes: LigneStock[]; dormants: string[] } {
  const lignes: LigneStock[] = [];
  const dormants: string[] = [];
  for (const r of reserves) {
    if (labelsVisibles && !labelsVisibles.has(r.label_id)) continue;
    if (r.reserve_jours === null) dormants.push(r.nom);
    else lignes.push({ label_id: r.label_id, nom: r.nom, jours: r.reserve_jours, comptes: r.comptes });
  }
  lignes.sort((a, b) => a.jours - b.jours || a.nom.localeCompare(b.nom));
  dormants.sort((a, b) => a.localeCompare(b));
  return { lignes, dormants };
}
