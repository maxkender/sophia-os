// Pods — les chiffres du haut de la page et les lignes du tableau de bord.

import { partSurPeriode, type JourTableau, type PerceeTableau, type PodTableau, type TableauPods } from "./api";

/** L'objectif de la part des podz dans les posts du jour (en %), avant de viser 20 %. */
export const OBJECTIF_PART_PODS = 15;

export interface ResumePods {
  /** Le dernier jour complet (le dernier de la série est en cours). */
  hier: JourTableau | null;
  /** La part des podz sur les 7 jours qui s'arrêtent à hier. */
  septJours: number | null;
  /** Les 14 jours complets, du plus ancien au plus récent. */
  jours: JourTableau[];
  aValider: number;
  /** Les podz qui ont au moins une livraison en attente. */
  podsEnAttente: number;
  /** Livraisons dont la validation automatique a échoué : à décider à la main. */
  autoErreurs: number;
  percees: number;
  meilleure: PerceeTableau | null;
}

export function resumePods(data: TableauPods): ResumePods {
  // Le dernier jour est en cours : « hier » est l'avant-dernier.
  const complets = data.jours.slice(0, -1);
  const pods = data.pods.filter((p) => p.actif);
  const meilleure = data.percees.reduce<PerceeTableau | null>((m, p) => (!m || p.vues > m.vues ? p : m), null);
  return {
    hier: complets[complets.length - 1] ?? null,
    septJours: partSurPeriode(complets.slice(-7)),
    jours: complets,
    aValider: pods.reduce((n, p) => n + p.a_valider, 0),
    podsEnAttente: pods.filter((p) => p.a_valider > 0).length,
    autoErreurs: pods.reduce((n, p) => n + (p.auto_erreurs ?? 0), 0),
    percees: data.percees.length,
    meilleure,
  };
}

/**
 * Les podz du tableau : actifs et qui ont déjà publié ou des contenus, plus
 * tout podz qui a une livraison en attente (sinon on ne le voit nulle part).
 * Ceux qui attendent une validation d'abord, puis par vues médianes.
 */
export function lignesPods(pods: PodTableau[]): PodTableau[] {
  return pods
    .filter((p) => (p.actif && (p.publies_30j > 0 || p.contenus > 0)) || p.a_valider > 0)
    .sort((a, b) => Number(b.a_valider > 0) - Number(a.a_valider > 0) || (b.vues_mediane ?? -1) - (a.vues_mediane ?? -1));
}
