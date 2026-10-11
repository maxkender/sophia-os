/**
 * Choix du label d'un compte créé, quand la File des créateurs n'impose rien.
 *
 * Avant : « le label le moins présent dans la langue, égalités au hasard ». Le
 * moins présent était souvent le plus maigre (alpha_male_film, white_bg), et le
 * hasard laissait des langues entières sur un même label.
 *
 * Maintenant, sans aucun hasard :
 *   1. chaque label candidat a un POIDS = √stock × facteur de performance
 *      (médiane 28 j de ses vues rapportées à la médiane de leur langue, face à
 *      la même médiane sur la flotte ; lissée vers 1 quand il a peu de posts,
 *      bornée à [×0,5 ; ×2]) ; sa PART est son poids sur la somme des poids,
 *      plafonnée à 1/2 (l'excédent revient aux autres) ;
 *   2. PAS DE RAFALE : un label qui porte déjà 2 des 3 derniers comptes de la
 *      langue est écarté (sauf s'ils le sont tous) — jamais 3 fois le même
 *      label sur 4 comptes d'affilée, comptes de la File compris ;
 *   3. on prend le label le plus EN RETARD dans la langue du compte :
 *      retard = part × (comptes de la langue + 1) − comptes de ce label dans la
 *      langue. Une langue suit ainsi les parts et se rattrape d'elle-même ;
 *   4. parmi les labels en retard, celui qui n'a servi à aucun des derniers
 *      comptes de la langue passe d'abord, puis celui qui a servi le moins
 *      récemment : pas deux fois de suite le même quand un autre attend ;
 *   5. à égalité, le plus en retard dans la langue, puis sur toute la flotte
 *      (même calcul), puis le plus lourd, puis l'identifiant (stable).
 *
 * Aucun label n'est écarté pour son stock (pas de seuil) : un label sans stock
 * pèse √1. Les comptes existants ne bougent pas : seul le prochain choix
 * change. Module pur : manage-users lit les chiffres
 * (`stats_choix_label_creation`, migration 0275) et retombe sur l'ancien
 * « moins utilisé » si la lecture échoue.
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
  /** Médiane des vues de ses posts, chacune rapportée à la médiane de sa langue. */
  perf_label: number | null;
  /** La même médiane sur tous les labels candidats (≈ 1). */
  perf_flotte: number | null;
  /** Combien des derniers comptes créés dans la langue portent ce label. */
  recents_nb: number;
  /**
   * Récence parmi ces derniers comptes : 0 = aucun ne le porte ; sinon plus
   * c'est grand, plus il vient de servir (le dernier compte créé vaut la
   * taille de la fenêtre).
   */
  recence: number;
}

/** Posts « fictifs » à la performance de la flotte : lisse les labels peu postés. */
export const PERF_LISSAGE_PASSAGES = 100;
export const PERF_FACTEUR_MIN = 0.5;
export const PERF_FACTEUR_MAX = 2;
/** Part maximale d'un label dans une langue (au plus 2 comptes sur 4). */
export const PART_MAX = 0.5;
/** Un label présent sur autant des derniers comptes de la langue attend. */
export const RAFALE_RECENTS = 2;
const EPS = 1e-9;

/** Clé de tri tolérante ET transitive : deux valeurs à moins de EPS près se valent. */
function cle(x: number): number {
  return Math.round(x / EPS);
}

function nombre(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNull(v: unknown): number | null {
  return v === null || v === undefined ? null : nombre(v);
}

/** Statistique brute (ligne RPC, nombres en texte compris) → valeurs propres. */
export function normaliserStatLabel(brut: Record<string, unknown>): StatLabelCreation {
  return {
    label_id: String(brut.label_id ?? ""),
    comptes_langue: Math.max(0, nombre(brut.comptes_langue)),
    comptes_total: Math.max(0, nombre(brut.comptes_total)),
    stock: Math.max(0, nombre(brut.stock)),
    passages: Math.max(0, nombre(brut.passages)),
    perf_label: nombreOuNull(brut.perf_label),
    perf_flotte: nombreOuNull(brut.perf_flotte),
    recents_nb: Math.max(0, nombre(brut.recents_nb)),
    recence: Math.max(0, nombre(brut.recence)),
  };
}

/** Facteur de performance d'un label (1 = comme la flotte). */
export function facteurPerformance(s: StatLabelCreation): number {
  const flotte = s.perf_flotte ?? 0;
  if (flotte <= 0) return 1;
  const n = s.passages > 0 && s.perf_label !== null ? s.passages : 0;
  const perf = n > 0 ? (s.perf_label as number) : flotte;
  const lissee = (perf * n + flotte * PERF_LISSAGE_PASSAGES) / (n + PERF_LISSAGE_PASSAGES);
  return Math.min(PERF_FACTEUR_MAX, Math.max(PERF_FACTEUR_MIN, lissee / flotte));
}

export function poidsLabel(s: StatLabelCreation): number {
  return Math.sqrt(Math.max(1, s.stock)) * facteurPerformance(s);
}

/**
 * Parts proportionnelles aux poids, aucune au-dessus de `PART_MAX` (ou de 1/n
 * s'il y a moins de 2 labels) : l'excédent est redistribué aux autres au
 * prorata de leurs poids, jusqu'à ce que plus aucune ne dépasse.
 */
export function partsPlafonnees(poids: readonly number[]): number[] {
  const n = poids.length;
  if (n === 0) return [];
  const total = poids.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return poids.map(() => 1 / n);
  const plafond = Math.max(PART_MAX, 1 / n);
  const parts = poids.map((p) => p / total);
  const plafonnes = new Set<number>();
  for (;;) {
    const libres = parts.map((_, i) => i).filter((i) => !plafonnes.has(i));
    const reste = 1 - plafonnes.size * plafond;
    const somme = libres.reduce((a, i) => a + poids[i], 0);
    for (const i of libres) parts[i] = somme > 0 ? (reste * poids[i]) / somme : reste / libres.length;
    const trop = libres.filter((i) => parts[i] > plafond + EPS);
    if (trop.length === 0) return parts;
    for (const i of trop) {
      plafonnes.add(i);
      parts[i] = plafond;
    }
  }
}

export interface LabelClasse {
  label_id: string;
  poids: number;
  part: number;
  retardLangue: number;
  retardFlotte: number;
  recence: number;
  /** Déjà sur `RAFALE_RECENTS` des derniers comptes de la langue. */
  rafale: boolean;
}

/** Les candidats, du meilleur au moins bon (le premier est le choix). */
export function classerLabels(stats: readonly StatLabelCreation[]): LabelClasse[] {
  const uniques = new Map<string, StatLabelCreation>();
  for (const s of stats) if (s.label_id && !uniques.has(s.label_id)) uniques.set(s.label_id, s);
  const liste = [...uniques.values()];
  if (liste.length === 0) return [];

  const poids = liste.map(poidsLabel);
  const parts = partsPlafonnees(poids);
  const nLangue = liste.reduce((a, s) => a + s.comptes_langue, 0);
  const nFlotte = liste.reduce((a, s) => a + s.comptes_total, 0);

  const classes = liste.map((s, i): LabelClasse => ({
    label_id: s.label_id,
    poids: poids[i],
    part: parts[i],
    retardLangue: parts[i] * (nLangue + 1) - s.comptes_langue,
    retardFlotte: parts[i] * (nFlotte + 1) - s.comptes_total,
    recence: s.recence,
    rafale: s.recents_nb >= RAFALE_RECENTS,
  }));
  // Tous en rafale (pool de 1 ou 2 labels) : la règle ne départage plus.
  const tousEnRafale = classes.every((c) => c.rafale);

  return classes.sort((a, b) => {
    if (!tousEnRafale && a.rafale !== b.rafale) return a.rafale ? 1 : -1;
    const aEnRetard = cle(a.retardLangue) > 0;
    const bEnRetard = cle(b.retardLangue) > 0;
    if (aEnRetard !== bEnRetard) return aEnRetard ? -1 : 1;
    // La récence ne départage que des labels EN RETARD : entre labels déjà
    // servis, le moins en avance d'abord, sinon un petit label trop servi
    // repasserait sans fin devant les gros.
    if (aEnRetard && a.recence !== b.recence) return a.recence - b.recence;
    if (cle(a.retardLangue) !== cle(b.retardLangue)) return cle(b.retardLangue) - cle(a.retardLangue);
    if (cle(a.retardFlotte) !== cle(b.retardFlotte)) return cle(b.retardFlotte) - cle(a.retardFlotte);
    if (cle(a.poids) !== cle(b.poids)) return cle(b.poids) - cle(a.poids);
    return a.label_id < b.label_id ? -1 : a.label_id > b.label_id ? 1 : 0;
  });
}

export function choisirLabelEquilibre(stats: readonly StatLabelCreation[]): string | null {
  return classerLabels(stats)[0]?.label_id ?? null;
}
