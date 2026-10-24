/**
 * Calculs partagés par les graphiques : graduations, moyenne glissante,
 * nombres abrégés. Purs, pour être testés sans rendu.
 */

const PAS_RONDS = [1, 2, 2.5, 5, 10];

/** Pas « rond » (1, 2, 2,5, 5 × 10ⁿ) qui découpe `etendue` en `cible` tranches environ. */
function pasRond(etendue: number, cible: number): number {
  const brut = etendue / Math.max(1, cible);
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const m = PAS_RONDS.find((p) => p * puissance >= brut) ?? 10;
  return m * puissance;
}

/**
 * Graduations de l'axe des valeurs. Le zéro est toujours dedans (des barres
 * partent de zéro), et les bornes englobent toutes les valeurs.
 */
export function graduations(
  valeurs: ReadonlyArray<number | null>,
  cible = 4,
): { min: number; max: number; ticks: number[] } {
  const v = valeurs.filter((x): x is number => x !== null && Number.isFinite(x));
  const bas = Math.min(0, ...v);
  const haut = Math.max(0, ...v);
  if (bas === 0 && haut === 0) return { min: 0, max: 1, ticks: [0, 1] };
  const pas = pasRond(haut - bas, cible);
  const min = Math.floor(bas / pas) * pas;
  const max = Math.ceil(haut / pas) * pas;
  const ticks: number[] = [];
  // Arrondi à chaque pas : 0,1 + 0,2 ne doit pas donner 0,30000000000000004.
  for (let t = min; t <= max + pas / 2; t += pas) ticks.push(Number(t.toPrecision(12)));
  return { min, max, ticks };
}

/**
 * Moyenne des `fenetre` derniers points, point courant compris. Les trous
 * (`null`) sont ignorés ; un point sans aucune valeur dans sa fenêtre reste `null`.
 */
export function moyenneGlissante(
  valeurs: ReadonlyArray<number | null>,
  fenetre: number,
): Array<number | null> {
  return valeurs.map((_, i) => {
    const tranche = valeurs
      .slice(Math.max(0, i - fenetre + 1), i + 1)
      .filter((x): x is number => x !== null);
    if (tranche.length === 0) return null;
    return tranche.reduce((a, b) => a + b, 0) / tranche.length;
  });
}

/** 290 000 → « 290 k » (fr) / « 290K » (en). */
export function abrege(n: number, langue: string): string {
  return new Intl.NumberFormat(langue === "fr" ? "fr-FR" : "en-US", {
    notation: "compact",
    maximumFractionDigits: Math.abs(n) >= 1_000 && Math.abs(n) < 10_000 ? 1 : 0,
  }).format(n);
}

/** 290000 → « 290 000 » : la valeur exacte, pour les infobulles. */
export function exact(n: number, langue: string): string {
  return Math.round(n).toLocaleString(langue === "fr" ? "fr-FR" : "en-US");
}

/**
 * Les index à étiqueter sur l'axe du temps : le premier, le dernier, et des
 * points réguliers entre les deux, sans jamais en coller deux.
 */
export function indexEtiquettes(n: number, combien = 5): number[] {
  if (n <= 0) return [];
  if (n <= combien) return Array.from({ length: n }, (_, i) => i);
  if (combien < 2) return [n - 1];
  const pas = Math.ceil((n - 1) / (combien - 1));
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += pas) out.push(i);
  // Le dernier point est toujours là ; l'avant-dernière étiquette saute si
  // elle collerait à la sienne.
  if (out.length > 1 && n - 1 - out[out.length - 1]! < (pas * 3) / 4) out.pop();
  out.push(n - 1);
  return out;
}
