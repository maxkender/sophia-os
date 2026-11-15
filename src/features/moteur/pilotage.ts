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

/** Part minimale des posts d'un jour photographiés à J+1/J+3 pour montrer son TOTAL à cet âge. */
export const COUVERTURE_JALON = 0.8;
/**
 * À J+7, la photo ne prend que les posts encore relus (45 à 69 % d'un jour) :
 * jamais de total, moyenne et médiane dès ce nombre de posts photographiés.
 */
export const POSTS_MIN_J7 = 30;

type LigneVues = {
  jour: unknown;
  vues: unknown;
  posts_mesures: unknown;
  nb_comptes: unknown;
  med?: unknown;
  vues_j1?: unknown;
  vues_j3?: unknown;
  vues_j7?: unknown;
  posts_j1?: unknown;
  posts_j3?: unknown;
  posts_j7?: unknown;
  med_j1?: unknown;
  med_j3?: unknown;
  med_j7?: unknown;
};

export type MesureVues = "vues" | "j1" | "j3" | "j7";
export type CalculVues = "total" | "moyenne" | "mediane" | "posts";

/** Les vues d'un jour à un âge : total, posts photographiés, médiane par post. */
export type MesureJour = { total: number | null; posts: number; mediane: number | null };

const nombre = (x: unknown) => (x == null ? null : Number(x));

/**
 * La série du graphique « Vues par jour », jour par jour du premier jour lu
 * jusqu'à `veille` : un jour absent de la vue (aucun post publié) devient un
 * trou ; hier et avant-hier sont provisoires. `jalons` : les vues figées à
 * 1, 3 et 7 jours (photos de la nuit, 0731/0732), comparables d'un jour à l'autre.
 */
export function serieVuesParJour(
  lignes: ReadonlyArray<LigneVues>,
  veille: string,
): PilotageDashboard["vuesSerie"] {
  const parJour = new Map(lignes.map((l) => [String(l.jour), l]));
  const premier = [...parJour.keys()].sort()[0];
  if (!premier || premier > veille) return [];
  const debutProvisoire = plusJours(veille, 1 - JOURS_VUES_PROVISOIRES);
  const out: PilotageDashboard["vuesSerie"] = [];
  const jalon = (l: LigneVues | undefined, age: 1 | 3 | 7): MesureJour => ({
    total: nombre(l?.[`vues_j${age}`]),
    posts: Number(l?.[`posts_j${age}`] ?? 0),
    mediane: nombre(l?.[`med_j${age}`]),
  });
  for (let j = premier; j <= veille; j = plusJours(j, 1)) {
    const l = parJour.get(j);
    out.push({
      jour: j,
      vues: nombre(l?.vues),
      posts: Number(l?.posts_mesures ?? 0),
      comptes: Number(l?.nb_comptes ?? 0),
      provisoire: j >= debutProvisoire,
      mediane: nombre(l?.med),
      jalons: { j1: jalon(l, 1), j3: jalon(l, 3), j7: jalon(l, 7) },
    });
  }
  return out;
}

/** Le total a-t-il un sens pour cette mesure ? (À J+7, la photo est partielle : non.) */
export const totalPossible = (m: MesureVues) => m !== "j7";

/**
 * La valeur d'un jour du graphique pour une mesure et un calcul, ou `null`
 * (trou) quand elle serait fausse : total à J+1/J+3 sous 80 % de posts
 * photographiés, tout calcul à J+7 sous 30 posts, total à J+7 jamais.
 */
export function valeurVuesJour(
  s: PilotageDashboard["vuesSerie"][number],
  m: MesureVues,
  c: CalculVues,
): number | null {
  const x: MesureJour = m === "vues" ? { total: s.vues, posts: s.posts, mediane: s.mediane } : s.jalons[m];
  if (m !== "vues") {
    if (x.posts === 0) return null;
    if (m === "j7" && x.posts < POSTS_MIN_J7) return null;
  }
  switch (c) {
    case "posts":
      return x.posts > 0 ? x.posts : null;
    case "mediane":
      return x.mediane == null ? null : Math.round(x.mediane);
    case "moyenne":
      return x.total == null || x.posts === 0 ? null : Math.round(x.total / x.posts);
    case "total":
      if (!totalPossible(m)) return null;
      if (m !== "vues" && x.posts < COUVERTURE_JALON * s.posts) return null;
      return x.total;
  }
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
