/**
 * La logique du parcours d'accueil, hors React : ce qui décide si on peut
 * avancer, et ce qui corrige le quiz.
 *
 * Séparé du composant exprès. Ce sont ces règles-là qui font qu'un créateur ne
 * peut pas cliquer trois fois et déclarer avoir lu ; elles méritent des tests
 * qui ne dépendent ni du DOM ni d'un minuteur réel.
 */

import { ECRANS, QUESTIONS, type Question } from "./contenu";

/** L'écran du quiz vient après le dernier écran de texte. */
export const INDEX_QUIZ = ECRANS.length;

/** Nombre total d'étapes, quiz compris. */
export const NB_ETAPES = ECRANS.length + 1;

/**
 * Reprise après une fermeture d'onglet : on revient où on en était, jamais
 * plus loin. Une valeur absente, négative ou au-delà du parcours retombe sur
 * un bord — on ne saute pas le parcours à cause d'une ligne abîmée en base.
 */
export function etapeDeReprise(enregistree: unknown): number {
  const n = Number(enregistree);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), INDEX_QUIZ);
}

/** Marge sous laquelle on considère le bas de page atteint, en pixels. */
export const SEUIL_BAS_PX = 24;

/**
 * Le bas de l'écran est-il atteint ?
 *
 * Un conteneur qui tient entièrement (`scrollHeight === clientHeight`) répond
 * oui dès le premier coup : il n'y a rien à faire défiler, exiger un
 * défilement verrouillerait le bouton pour toujours.
 *
 * `clientHeight` à zéro veut dire « pas encore mesuré », pas « ça déborde » :
 * le dialogue a une animation d'entrée, et la première mesure tombe pendant.
 * On répond non, et c'est à l'appelant de REMESURER — jamais de conclure sur
 * cette seule réponse. C'est précisément ce qui a verrouillé l'écran 1 en
 * production : une mesure unique, prise trop tôt, jamais reprise.
 */
export function basDePageAtteint(mesure: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): boolean {
  if (mesure.clientHeight <= 0) return false;
  return mesure.scrollHeight - mesure.scrollTop - mesure.clientHeight <= SEUIL_BAS_PX;
}

/** Secondes encore à tenir sur l'écran, 0 quand l'attente est purgée. */
export function secondesRestantes(ecoulees: number, attente: number): number {
  const reste = Math.ceil(attente - ecoulees);
  return reste > 0 ? reste : 0;
}

/**
 * « Next » s'ouvre quand les DEUX conditions sont remplies : le temps est
 * passé ET le bas de l'écran a été atteint. Un écran trop court pour défiler
 * compte comme lu dès qu'il s'affiche (c'est au composant de le dire).
 */
export function peutAvancer(opts: {
  ecoulees: number;
  attente: number;
  basAtteint: boolean;
  /** L'écran demande le nom de la pièce d'identité et il n'est pas encore enregistré. */
  identiteManquante?: boolean;
}): boolean {
  return opts.basAtteint && secondesRestantes(opts.ecoulees, opts.attente) === 0 && !opts.identiteManquante;
}

export interface CorrectionQuiz {
  /** Toutes les questions ont reçu une réponse. */
  complet: boolean;
  /** Les questions ratées, dans l'ordre du quiz. */
  fausses: Question[];
  /** `Ecran.cle` du premier écran à relire, `null` si tout est bon. */
  ecranARelire: string | null;
  /** Rien à corriger : on peut terminer. */
  reussi: boolean;
}

/**
 * Corrige le quiz. Une seule faute suffit à renvoyer lire : l'enjeu n'est pas
 * une note, c'est que les quatre points soient sus.
 */
export function corrigerQuiz(reponses: Record<string, number | undefined>): CorrectionQuiz {
  const complet = QUESTIONS.every((q) => typeof reponses[q.cle] === "number");
  const fausses = QUESTIONS.filter((q) => reponses[q.cle] !== q.bonne);
  return {
    complet,
    fausses,
    ecranARelire: fausses[0]?.ecran ?? null,
    reussi: complet && fausses.length === 0,
  };
}

/** Index de l'écran portant cette clé, -1 si inconnue. */
export function indexEcran(cle: string): number {
  return ECRANS.findIndex((e) => e.cle === cle);
}
