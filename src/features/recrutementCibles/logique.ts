import type { CibleRecrutement } from "./api";

/** Prompt 21, D : les cibles par cohorte, la plus proche d'abord, et leurs totaux. */
export interface CohorteCibles {
  cohorte: string;
  lignes: CibleRecrutement[];
  cible: number;
  recrutes: number;
  ecart: number;
}

/**
 * Regroupe par cohorte (la plus récente d'abord), pays triés par écart puis
 * par nom. `avecCible` : seulement les pays qui ont une cible (la vue HM).
 */
export function parCohorte(lignes: CibleRecrutement[], o: { avecCible?: boolean; depuis?: string } = {}): CohorteCibles[] {
  const groupes = new Map<string, CibleRecrutement[]>();
  for (const l of lignes) {
    if (o.avecCible && l.cible <= 0) continue;
    if (o.depuis && l.cohorte < o.depuis) continue;
    groupes.set(l.cohorte, [...(groupes.get(l.cohorte) ?? []), l]);
  }
  return [...groupes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([cohorte, ls]) => {
      const tri = [...ls].sort((a, b) => b.ecart - a.ecart || a.pays.localeCompare(b.pays));
      return {
        cohorte,
        lignes: tri,
        cible: tri.reduce((n, l) => n + l.cible, 0),
        recrutes: tri.reduce((n, l) => n + l.recrutes, 0),
        // L'écart total : la somme des manques par pays (un pays en avance ne comble pas un autre).
        ecart: tri.reduce((n, l) => n + l.ecart, 0),
      };
    });
}

/** Les recrutés par pays d'une cohorte (la carte admin du samedi). */
export function recrutesParPays(lignes: CibleRecrutement[], cohorte: string): Map<string, number> {
  return new Map(lignes.filter((l) => l.cohorte === cohorte).map((l) => [l.pays.toUpperCase(), l.recrutes]));
}
