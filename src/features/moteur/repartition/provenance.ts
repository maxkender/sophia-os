/**
 * D'où vient la recrue, et ce que ça impose à la cible.
 *
 * Un créateur de la cohorte Ruul va TOUJOURS sur Sophia. Ce n'est pas une
 * préférence qu'un classement pourrait renverser, c'est une contrainte posée
 * en dehors du moteur : ces posters viennent du site, ils sont recrutés pour
 * Sophia, et aucune cible ne les déplacera.
 *
 * TANT QUE LA PAGE L'IGNORE, ELLE MENT. Elle montre « 60 % Sophia, 25 %
 * Unswipe, 15 % Micabo » comme si les trois applications se disputaient chaque
 * recrue. En français, sur 30 jours glissants, 5 recrues sur 11 viennent de
 * Ruul : 45 % des prochains comptes sont déjà promis à Sophia avant que le
 * moindre classement ne tourne. Viser 30 % de Sophia sur ce marché n'est pas
 * ambitieux, c'est impossible.
 *
 * CE QUE FAIT CE MODULE. Trois choses, et rien d'autre :
 *
 *  1. mesurer la part promise (`partCohorte`), à partir des effectifs réels ;
 *  2. en déduire ce que le moteur devrait viser pour les recrues qu'il place
 *     vraiment (`cibleHorsCohorte`), et surtout DIRE quand la cible de l'admin
 *     est impossible ;
 *  3. étaler les recrues promises sur une suite de tirages (`estTirageCohorte`).
 *
 * ATTENTION, PIÈGE : `cibleHorsCohorte` SERT À EXPLIQUER, PAS À CALCULER.
 * La projection (`simulerTirages`) reçoit la cible de l'admin TELLE QUELLE et
 * compte les comptes de la cohorte comme les autres. Sainte-Laguë se corrige
 * alors tout seul : chaque compte Ruul fait baisser le score de Sophia, qui
 * reçoit d'autant moins de recrues placées par le moteur. Lui passer en plus
 * une cible déjà corrigée corrigerait DEUX FOIS, et Sophia finirait très en
 * dessous de ce que l'admin a demandé.
 *
 * L'ARITHMÉTIQUE, une fois pour toutes. Soit `p` la part promise et `t` la
 * cible de Sophia. La cohorte fournit `p` de Sophia ; les recrues que le
 * moteur place valent `1 − p` du total. Pour que le total fasse `t` :
 *
 *     p + (1 − p) × h = t      d'où     h = (t − p) / (1 − p)
 *
 * et pour les autres applications `h_a = t_a / (1 − p)`. La somme des `h`
 * refait 100 toute seule, il n'y a rien à renormaliser derrière.
 *
 * Si `t < p`, alors `h < 0` : la cible est INATTEIGNABLE. On ne bricole pas un
 * nombre pour sauver la face, on met la cible de Sophia à zéro pour les
 * recrues du moteur et on dit que le minimum atteignable est `p`.
 *
 * Module pur, aucune lecture réseau, aucun effet de bord. Comme le reste du
 * dossier, il alimente la page Répartition et RIEN d'autre : `manage-users`
 * continue de lire la case cochée par le recruteur.
 */
import type { CibleApplications } from "./scoreApplication";

/**
 * L'application sur laquelle part un créateur de la cohorte Ruul.
 *
 * En dur, et c'est volontaire : c'est une règle de l'entreprise, pas un
 * réglage. Le jour où elle change, elle doit changer ICI, à un seul endroit,
 * avec un test qui le constate.
 */
export const APPLICATION_COHORTE_RUUL = "sophia";

/** Recrues d'un marché sur la fenêtre, et combien venaient de la cohorte. */
export interface ProvenanceMarche {
  langue: string;
  pays: string | null;
  /** Comptes créés sur la fenêtre, servis par l'assignation. */
  recrues: number;
  /** Parmi eux, ceux d'un poster de la cohorte Ruul. */
  recruesRuul: number;
}

/**
 * En dessous de ce nombre de recrues, un marché ne dit rien de fiable.
 *
 * 1 sur 1 ferait « 100 % de la cohorte » et verrouillerait tout le marché sur
 * Sophia dans la projection, sur la foi d'un seul compte. On retombe alors sur
 * la part de la flotte entière, et la page affiche d'où vient le chiffre.
 */
export const RECRUES_MINIMUM_MARCHE = 5;

export interface PartCohorte {
  /** Part promise à Sophia, entre 0 et 1. */
  part: number;
  /** Sur quoi elle est mesurée : ce marché, la flotte entière, ou rien. */
  base: "marche" | "flotte" | "aucune";
  /** Effectifs ayant servi au calcul, pour que la page montre l'échantillon. */
  recrues: number;
  recruesRuul: number;
}

/**
 * La part des prochaines recrues déjà promise à la cohorte, sur un marché.
 *
 * On rend les EFFECTIFS avec la part : 5 sur 11 et 50 sur 110 valent le même
 * pourcentage et ne méritent pas la même confiance. C'est à la lecture de
 * trancher, et elle ne peut trancher que si elle voit les deux nombres.
 */
export function partCohorte(
  marche: ProvenanceMarche | undefined,
  flotte: readonly ProvenanceMarche[],
  seuil: number = RECRUES_MINIMUM_MARCHE,
): PartCohorte {
  if (marche && marche.recrues >= Math.max(1, seuil)) {
    return {
      part: borner(marche.recruesRuul / marche.recrues),
      base: "marche",
      recrues: marche.recrues,
      recruesRuul: marche.recruesRuul,
    };
  }

  const recrues = flotte.reduce((a, m) => a + m.recrues, 0);
  const ruul = flotte.reduce((a, m) => a + m.recruesRuul, 0);
  if (recrues <= 0) {
    return { part: 0, base: "aucune", recrues: 0, recruesRuul: 0 };
  }
  return { part: borner(ruul / recrues), base: "flotte", recrues, recruesRuul: ruul };
}

function borner(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return x >= 1 ? 1 : x;
}

export interface CibleCorrigee {
  /**
   * Ce que le moteur devrait viser pour les recrues QU'IL PLACE, somme 100.
   * À AFFICHER, pas à passer à `simulerTirages` : voir l'en-tête du module.
   */
  parts: Record<string, number>;
  /** La cible de l'admin est-elle atteignable, cohorte comprise ? */
  atteignable: boolean;
  /** Si elle ne l'est pas : la part de Sophia qu'on ne peut pas descendre. */
  minimum: number;
  /** La part promise, en pourcentage, telle qu'affichée à côté. */
  partPromise: number;
}

/**
 * La cible à viser pour les recrues que le moteur place, cohorte déduite.
 *
 * `cible.parts` est attendue DÉJÀ renormalisée sur les applications servies
 * par le marché (c'est ce que fait `classerApplications`) : corriger une cible
 * qui compterait une application absente donnerait un résultat faux.
 *
 * Quand la cible est inatteignable, Sophia tombe à zéro pour ces recrues. Ce
 * n'est pas une erreur à rattraper : Sophia est déjà sur-servie par la
 * cohorte, les recrues du moteur doivent aller ailleurs.
 *
 * « Inatteignable » porte sur le RÉGIME PERMANENT, pas sur les vingt
 * prochaines recrues. Si Sophia est aujourd'hui sous-représentée dans le stock
 * du marché, le moteur peut lui envoyer beaucoup de monde pendant un moment ;
 * ce que la cohorte interdit, c'est de stabiliser Sophia sous `p` à la longue.
 */
export function cibleHorsCohorte(
  cible: CibleApplications,
  part: number,
  slugCohorte: string = APPLICATION_COHORTE_RUUL,
): CibleCorrigee {
  const p = borner(part);
  const total = Object.values(cible.parts).reduce((a, b) => a + b, 0);
  const visee = total > 0 ? (cible.parts[slugCohorte] ?? 0) / total : 0;
  const partPromise = 100 * p;

  // Aucune recrue promise : rien à corriger, la cible passe telle quelle.
  if (p <= 0) {
    return { parts: { ...cible.parts }, atteignable: true, minimum: 0, partPromise: 0 };
  }

  // Tout est promis : le moteur ne place plus personne. La seule cible encore
  // vraie est « 100 % sur l'application de la cohorte ».
  if (p >= 1) {
    return {
      parts: { [slugCohorte]: 100 },
      atteignable: visee >= 1,
      minimum: 100,
      partPromise: 100,
    };
  }

  // Inatteignable : la cohorte fournit déjà plus de Sophia que la cible n'en
  // demande. On met Sophia à zéro pour les recrues du moteur et on le dit.
  if (visee < p) {
    const autres = Object.entries(cible.parts).filter(([slug]) => slug !== slugCohorte);
    const somme = autres.reduce((a, [, v]) => a + v, 0);
    const parts: Record<string, number> = { [slugCohorte]: 0 };
    for (const [slug, v] of autres) parts[slug] = somme > 0 ? (100 * v) / somme : 0;
    return { parts, atteignable: false, minimum: partPromise, partPromise };
  }

  const parts: Record<string, number> = {};
  for (const [slug, v] of Object.entries(cible.parts)) {
    const t = total > 0 ? v / total : 0;
    parts[slug] = (100 * (slug === slugCohorte ? t - p : t)) / (1 - p);
  }
  return { parts, atteignable: true, minimum: partPromise, partPromise };
}

/**
 * Le rang `i` (à partir de 0) sur `n` tirages est-il une recrue de la cohorte ?
 *
 * Pas de hasard : la page doit donner le même tableau à chaque ouverture,
 * sinon personne ne peut s'en servir pour décider. On répartit les `round(n×p)`
 * recrues promises régulièrement sur la suite, à la façon d'un tracé de
 * droite : le tirage `i` est de la cohorte dès que la part cumulée franchit un
 * entier de plus qu'au tirage précédent.
 */
export function estTirageCohorte(i: number, part: number): boolean {
  const p = borner(part);
  if (p <= 0) return false;
  if (p >= 1) return true;
  return Math.floor((i + 1) * p) > Math.floor(i * p);
}
