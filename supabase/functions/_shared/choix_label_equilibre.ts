/**
 * Choix du label d'un compte créé, quand la File des créateurs n'impose rien.
 *
 * Avant : « le label le moins présent dans la langue, égalités au hasard ». Le
 * moins présent était souvent le plus maigre (alpha_male_film, white_bg), et le
 * hasard laissait des langues entières sur un même label.
 *
 * Maintenant, sans aucun hasard :
 *   1. chaque label candidat a un POIDS = √stock × facteur de performance
 *      (médiane de vues 28 j du label rapportée à celle de la flotte, lissée vers
 *      1 quand il a peu de posts, bornée à [×0,5 ; ×2]) ; sa PART est son poids
 *      sur la somme des poids ;
 *   2. on prend le label le plus EN RETARD dans la langue du compte :
 *      retard = part × (comptes de la langue + 1) − comptes de ce label dans la
 *      langue. Une langue suit ainsi les parts : 4 comptes → 4 labels
 *      différents dès que la plus grosse part est sous 1/3 ; une langue
 *      déséquilibrée se rattrape d'elle-même ;
 *   3. pas le même label en rafale : parmi les labels en retard, celui qui n'a
 *      servi à aucun des derniers comptes de la langue passe d'abord, puis
 *      celui qui a servi le moins récemment (`recents_langue`). Sans cette
 *      règle, une langue en rattrapage enchaînerait 3 fois son label le plus
 *      en retard. Seuls les labels en retard sont candidats en tête : un petit
 *      pool garde ses parts au lieu de tourner en rond ;
 *   4. à égalité, le plus en retard dans la langue, puis sur toute la flotte
 *      (même calcul), puis le plus lourd, puis l'identifiant (stable).
 *
 * Aucun label n'est écarté (pas de seuil de stock) : un label sans stock pèse
 * √1. Les comptes existants ne bougent pas : seul le prochain choix change.
 * Module pur : manage-users lit les chiffres (`stats_labels_creation`) et
 * retombe sur l'ancien « moins utilisé » si la lecture échoue.
 */

export interface StatLabelCreation {
  label_id: string;
  /** Liens actifs compte ↔ label dans la langue du compte créé. */
  comptes_langue: number;
  /** Liens actifs compte ↔ label dans toute la flotte. */
  comptes_total: number;
  /** Contenus validés du label, utilisables par l'application. */
  stock: number;
  /** Posts publiés sur 28 j (application du compte) avec des vues. */
  passages: number;
  mediane_vues: number | null;
  /** Médiane de vues sur tous les labels candidats (même fenêtre). */
  mediane_flotte: number | null;
  /**
   * Récence parmi les derniers comptes créés dans la langue : 0 = aucun ne le
   * porte ; sinon plus c'est grand, plus il vient de servir (le dernier compte
   * créé vaut la taille de la fenêtre, cf. `stats_labels_creation`).
   */
  recents_langue: number;
}

/** Posts « fictifs » à la médiane de la flotte : lisse les labels peu postés. */
export const PERF_LISSAGE_PASSAGES = 100;
export const PERF_FACTEUR_MIN = 0.5;
export const PERF_FACTEUR_MAX = 2;
const EPS = 1e-9;

function nombre(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Statistique brute (ligne RPC, nombres en texte compris) → valeurs propres. */
export function normaliserStatLabel(brut: Record<string, unknown>): StatLabelCreation {
  const med = brut.mediane_vues;
  const flotte = brut.mediane_flotte;
  return {
    label_id: String(brut.label_id ?? ""),
    comptes_langue: Math.max(0, nombre(brut.comptes_langue)),
    comptes_total: Math.max(0, nombre(brut.comptes_total)),
    stock: Math.max(0, nombre(brut.stock)),
    passages: Math.max(0, nombre(brut.passages)),
    mediane_vues: med === null || med === undefined ? null : nombre(med),
    mediane_flotte: flotte === null || flotte === undefined ? null : nombre(flotte),
    recents_langue: Math.max(0, nombre(brut.recents_langue)),
  };
}

/** Facteur de performance d'un label (1 = comme la flotte). */
export function facteurPerformance(s: StatLabelCreation): number {
  const flotte = s.mediane_flotte ?? 0;
  if (flotte <= 0) return 1;
  const n = s.passages > 0 && s.mediane_vues !== null ? s.passages : 0;
  const med = n > 0 ? (s.mediane_vues as number) : flotte;
  const lissee = (med * n + flotte * PERF_LISSAGE_PASSAGES) / (n + PERF_LISSAGE_PASSAGES);
  return Math.min(PERF_FACTEUR_MAX, Math.max(PERF_FACTEUR_MIN, lissee / flotte));
}

export function poidsLabel(s: StatLabelCreation): number {
  return Math.sqrt(Math.max(1, s.stock)) * facteurPerformance(s);
}

export interface LabelClasse {
  label_id: string;
  poids: number;
  part: number;
  retardLangue: number;
  retardFlotte: number;
  recence: number;
}

/** Les candidats, du meilleur au moins bon (le premier est le choix). */
export function classerLabels(stats: readonly StatLabelCreation[]): LabelClasse[] {
  const uniques = new Map<string, StatLabelCreation>();
  for (const s of stats) if (s.label_id && !uniques.has(s.label_id)) uniques.set(s.label_id, s);
  const liste = [...uniques.values()];
  if (liste.length === 0) return [];

  const poids = new Map(liste.map((s) => [s.label_id, poidsLabel(s)]));
  const total = [...poids.values()].reduce((a, b) => a + b, 0);
  const nLangue = liste.reduce((a, s) => a + s.comptes_langue, 0);
  const nFlotte = liste.reduce((a, s) => a + s.comptes_total, 0);

  const classes = liste.map((s): LabelClasse => {
    const p = poids.get(s.label_id) ?? 0;
    const part = total > 0 ? p / total : 1 / liste.length;
    const retardLangue = part * (nLangue + 1) - s.comptes_langue;
    return {
      label_id: s.label_id,
      poids: p,
      part,
      retardLangue,
      retardFlotte: part * (nFlotte + 1) - s.comptes_total,
      recence: s.recents_langue,
    };
  });

  return classes.sort((a, b) => {
    const aEnRetard = a.retardLangue > EPS;
    const bEnRetard = b.retardLangue > EPS;
    if (aEnRetard !== bEnRetard) return aEnRetard ? -1 : 1;
    if (a.recence !== b.recence) return a.recence - b.recence;
    if (Math.abs(a.retardLangue - b.retardLangue) > EPS) return b.retardLangue - a.retardLangue;
    if (Math.abs(a.retardFlotte - b.retardFlotte) > EPS) return b.retardFlotte - a.retardFlotte;
    if (Math.abs(a.poids - b.poids) > EPS) return b.poids - a.poids;
    return a.label_id < b.label_id ? -1 : a.label_id > b.label_id ? 1 : 0;
  });
}

export function choisirLabelEquilibre(stats: readonly StatLabelCreation[]): string | null {
  return classerLabels(stats)[0]?.label_id ?? null;
}
