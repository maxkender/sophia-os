/**
 * Calculs du Pilotage, à part de la page pour être testés sans rendu.
 */
import type { PilotageDashboard } from "./api";

/** Sous ce stock, un label s'affiche en rouge et part dans « À faire » (même seuil que l'Allocation). */
export const SEUIL_STOCK_JOURS = 7;

/**
 * Le rattrapage de minuit relit les stats des posts des 4 derniers jours
 * (RATTRAPAGE_JOURS_DEFAUT, jour courant compris) : hier et avant-hier seront
 * encore relus, leurs vues montent encore.
 */
export const JOURS_VUES_PROVISOIRES = 2;

/** YYYY-MM-DD + n jours, en jours de calendrier. */
function plusJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * La série du graphique « Vues par jour », jour par jour du premier jour lu
 * jusqu'à `veille` : un jour absent de la vue (aucun post publié) devient un
 * trou ; hier et avant-hier sont provisoires.
 */
export function serieVuesParJour(
  lignes: ReadonlyArray<{ jour: unknown; vues: unknown; posts_mesures: unknown; nb_comptes: unknown }>,
  veille: string,
): PilotageDashboard["vuesSerie"] {
  const parJour = new Map(lignes.map((l) => [String(l.jour), l]));
  const premier = [...parJour.keys()].sort()[0];
  if (!premier || premier > veille) return [];
  const debutProvisoire = plusJours(veille, 1 - JOURS_VUES_PROVISOIRES);
  const out: PilotageDashboard["vuesSerie"] = [];
  for (let j = premier; j <= veille; j = plusJours(j, 1)) {
    const l = parJour.get(j);
    out.push({
      jour: j,
      vues: l?.vues == null ? null : Number(l.vues),
      posts: Number(l?.posts_mesures ?? 0),
      comptes: Number(l?.nb_comptes ?? 0),
      provisoire: j >= debutProvisoire,
    });
  }
  return out;
}

/** Jours figés comparés : les 7 derniers, contre les 7 d'avant. */
const JOURS_REFERENCE = 7;

export interface ResumeVues {
  /** Premier et dernier jour figés de la semaine résumée. */
  du: string;
  au: string;
  /** Vues moyennes par jour sur ces jours (les jours sans post ne comptent pas). */
  parJour: number;
  /** La même moyenne sur les 7 jours figés d'avant ; `null` sans historique. */
  reference: number | null;
  /** Écart relatif à la référence (0,18 = +18 %) ; `null` si la référence est nulle ou absente. */
  ecart: number | null;
}

const moyenne = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Les vues par jour des 7 derniers jours figés (les jours encore relus, qui
 * montent encore, sont laissés de côté), comparées aux 7 jours d'avant.
 */
export function resumeVues(serie: PilotageDashboard["vuesSerie"]): ResumeVues | null {
  const figes = serie.filter((s) => !s.provisoire);
  const semaine = figes.slice(-JOURS_REFERENCE);
  const valeurs = semaine.flatMap((s) => (s.vues === null ? [] : [s.vues]));
  const parJour = moyenne(valeurs);
  if (parJour === null) return null;
  const avant = figes
    .slice(-2 * JOURS_REFERENCE, -JOURS_REFERENCE)
    .flatMap((s) => (s.vues === null ? [] : [s.vues]));
  const reference = moyenne(avant);
  return {
    du: semaine[0]!.jour,
    au: semaine[semaine.length - 1]!.jour,
    parJour,
    reference,
    ecart: reference && reference > 0 ? parJour / reference - 1 : null,
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
