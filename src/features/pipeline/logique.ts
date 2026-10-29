import type { CartePipeline } from "./api";

/** Les 6 colonnes, de gauche à droite. */
export const COLONNES = [1, 2, 3, 4, 5, 6] as const;

export interface FiltresPipeline {
  hm: string;
  pays: string;
  risque: boolean;
}
export const FILTRES_VIDES: FiltresPipeline = { hm: "", pays: "", risque: false };

/** À risque : relancée (orange) ou Kill en attente (rouge). */
export function aRisque(c: Pick<CartePipeline, "etat">): boolean {
  return c.etat === "relance" || c.etat === "kill";
}

export function filtrer(cartes: readonly CartePipeline[], f: FiltresPipeline): CartePipeline[] {
  return cartes.filter((c) => (!f.hm || c.hm_id === f.hm) && (!f.pays || c.pays === f.pays) && (!f.risque || aRisque(c)));
}

/** Les cartes par colonne : à risque d'abord, puis les plus anciennes à leur étape. */
export function parColonne(cartes: readonly CartePipeline[]): Record<number, CartePipeline[]> {
  const rang = (c: CartePipeline) => (c.etat === "kill" ? 0 : c.etat === "relance" ? 1 : c.etat === "repondu" ? 2 : 3);
  const out: Record<number, CartePipeline[]> = Object.fromEntries(COLONNES.map((n) => [n, []]));
  for (const c of cartes) (out[c.colonne] ??= []).push(c);
  for (const n of COLONNES) {
    out[n]!.sort((a, b) => rang(a) - rang(b) || (Date.parse(a.colonne_depuis ?? "") || 0) - (Date.parse(b.colonne_depuis ?? "") || 0));
  }
  return out;
}

/** « 3 j », « 5 h », « 12 min » : depuis combien de temps (ou dans combien de temps). */
export function duree(ms: number): { n: number; unite: "j" | "h" | "min" } {
  const abs = Math.max(0, ms);
  if (abs >= 86_400_000) return { n: Math.floor(abs / 86_400_000), unite: "j" };
  if (abs >= 3_600_000) return { n: Math.floor(abs / 3_600_000), unite: "h" };
  return { n: Math.max(1, Math.floor(abs / 60_000)), unite: "min" };
}

/**
 * Les cartes qui viennent d'avancer d'une colonne (entre deux lectures) :
 * elles restent un instant dans leur ancienne colonne, en vert avec une
 * flèche, puis glissent dans la suivante.
 */
export function cartesAvancees(avant: ReadonlyMap<string, number>, apres: readonly CartePipeline[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of apres) {
    const ancienne = avant.get(c.carte_id);
    if (ancienne !== undefined && c.colonne > ancienne) out.set(c.carte_id, ancienne);
  }
  return out;
}
