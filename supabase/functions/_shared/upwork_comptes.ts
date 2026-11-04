/**
 * 3/11 : remplacé — les messages automatiques ne partent plus que du compte de Max (voir choisirCompte).
 * Historique (prompt 25, mises à jour, point 2) : les messages Upwork sur deux comptes.
 * Adrien (« secours ») d'abord, jusqu'à 45 personnes différentes par jour ou
 * la 1re erreur de limite d'Upwork ; puis Max (« principal »), jusqu'à 45 ;
 * ensuite la HM, à la main. Une personne déjà écrite aujourd'hui garde le même
 * compte toute la journée. La réserve (pour la bienvenue) est gardée sur le
 * dernier compte connecté (Max).
 * Seulement les messages : la paie, les milestones et la fin de contrat restent
 * sur le compte de Max. Rien ici ne touche la base ni le réseau.
 */

export const COMPTE_PRINCIPAL = "principal";
export const COMPTE_SECOURS = "secours";
export const COMPTES_UPWORK = [COMPTE_PRINCIPAL, COMPTE_SECOURS] as const;
export type CompteUpwork = (typeof COMPTES_UPWORK)[number];

export const lireCompte = (x: unknown): CompteUpwork => (x === COMPTE_SECOURS ? COMPTE_SECOURS : COMPTE_PRINCIPAL);

/** Un compte aujourd'hui (UTC), tel que `upwork_budget_jour` le rend. */
export interface CompteDuJour {
  compte: string;
  connecte: boolean;
  /** Conversations (personnes) différentes écrites aujourd'hui. */
  conversations: number;
  /** L'erreur de limite d'Upwork reçue aujourd'hui : plus rien jusqu'à demain. */
  limite: boolean;
  /** Ce contrat a déjà reçu un message de ce compte aujourd'hui. */
  deja: boolean;
}

export type ChoixCompte = { compte: string; nouvelle: boolean; raison: null } | { compte: null; nouvelle: false; raison: string };

/**
 * 3/11 : les messages automatiques partent UNIQUEMENT du compte de Max
 * (« principal », Owner de VIk Studios). Le compte de secours (Adrien) n'est
 * plus choisi : il ne sert plus qu'à « Run now » sur un contrat de test
 * (forcé, hors de cette fonction). Au plus `max` personnes par jour, la
 * réserve pour la bienvenue, le Kill et l'arrêt ; ensuite la HM, à la main.
 */
export function choisirCompte(
  comptes: readonly CompteDuJour[],
  o: { max: number; reserve: number; prioritaire: boolean; exclure?: readonly string[] },
): ChoixCompte {
  const max = comptes.find((c) => c.compte === COMPTE_PRINCIPAL);
  if (!max || !max.connecte || (o.exclure ?? []).includes(COMPTE_PRINCIPAL)) {
    return { compte: null, nouvelle: false, raison: "le compte Upwork de Max n'est pas connecté" };
  }
  if (max.limite) return { compte: null, nouvelle: false, raison: "limite Upwork du jour atteinte : plus rien jusqu'à demain" };
  // Une personne déjà écrite aujourd'hui ne compte pas une 2e fois.
  if (max.deja) return { compte: COMPTE_PRINCIPAL, nouvelle: false, raison: null };
  const plafond = o.prioritaire ? o.max : Math.max(0, o.max - o.reserve);
  if (max.conversations < plafond) return { compte: COMPTE_PRINCIPAL, nouvelle: true, raison: null };
  return { compte: null, nouvelle: false, raison: `budget Upwork du jour atteint (principal ${max.conversations}/${o.max})` };
}

/** 3/11 : le seul expéditeur accepté pour les messages automatiques : Maximilien Kender, Owner de VIk Studios. */
export const UPWORK_USER_MAX = "1908160914854122443";

/** Le compte connecté (upwork_connexion.utilisateur) est-il bien celui de Max ? */
export function estCompteDeMax(utilisateur: unknown): boolean {
  return (utilisateur as { id?: unknown } | null)?.id === UPWORK_USER_MAX;
}
