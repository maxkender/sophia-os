// BLEO — la grille « valeur par langue » d'une famille : un contenu par ligne,
// une langue par colonne, et le contenu que BLEO préfère dans chaque langue.

import type { ValeurLangue } from "./api";

export interface GrilleValeurs {
  /** Les langues où au moins un contenu de la famille a une valeur, par ordre alphabétique. */
  langues: string[];
  /** contenu_id → langue → valeur. */
  cellules: Map<string, Map<string, ValeurLangue>>;
  /** langue → le contenu à la plus haute valeur dans cette langue. */
  meilleur: Map<string, string>;
}

export function grilleValeurs(valeurs: ValeurLangue[]): GrilleValeurs {
  const cellules = new Map<string, Map<string, ValeurLangue>>();
  const meilleur = new Map<string, ValeurLangue>();
  for (const v of valeurs) {
    if (!(v.valeur > 0)) continue;
    let ligne = cellules.get(v.contenu_id);
    if (!ligne) cellules.set(v.contenu_id, (ligne = new Map()));
    ligne.set(v.langue, v);
    const actuel = meilleur.get(v.langue);
    if (!actuel || v.valeur > actuel.valeur) meilleur.set(v.langue, v);
  }
  return {
    langues: [...meilleur.keys()].sort(),
    cellules,
    meilleur: new Map([...meilleur].map(([langue, v]) => [langue, v.contenu_id])),
  };
}
