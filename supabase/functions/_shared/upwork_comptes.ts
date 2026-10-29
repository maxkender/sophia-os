/**
 * Prompt 25 v4 : les messages Upwork sur deux comptes. Max (« principal »)
 * d'abord, jusqu'à 45 personnes différentes par jour ou la 1re erreur de
 * limite d'Upwork ; puis Adrien (« secours »), jusqu'à 45. Une personne déjà
 * écrite aujourd'hui garde le même compte toute la journée. La réserve (pour
 * la bienvenue, le Kill, l'arrêt) est gardée sur le dernier compte connecté.
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

export function choisirCompte(
  comptes: readonly CompteDuJour[],
  o: { max: number; reserve: number; prioritaire: boolean; exclure?: readonly string[] },
): ChoixCompte {
  // Le même compte toute la journée pour une personne.
  const deja = comptes.find((c) => c.deja);
  if (deja) {
    if (deja.connecte && !deja.limite && !(o.exclure ?? []).includes(deja.compte)) return { compte: deja.compte, nouvelle: false, raison: null };
    return { compte: null, nouvelle: false, raison: `déjà écrit aujourd'hui par le compte ${deja.compte}, qui ne peut plus écrire : demain` };
  }
  const possibles = comptes.filter((c) => c.connecte && !(o.exclure ?? []).includes(c.compte));
  if (possibles.length === 0) return { compte: null, nouvelle: false, raison: "aucun compte Upwork connecté" };
  for (const [i, c] of possibles.entries()) {
    if (c.limite) continue;
    const dernier = i === possibles.length - 1;
    const plafond = o.prioritaire || !dernier ? o.max : Math.max(0, o.max - o.reserve);
    if (c.conversations < plafond) return { compte: c.compte, nouvelle: true, raison: null };
  }
  if (possibles.every((c) => c.limite)) return { compte: null, nouvelle: false, raison: "limite Upwork du jour atteinte : plus rien jusqu'à demain" };
  const detail = possibles.map((c) => `${c.compte} ${c.conversations}/${o.max}`).join(", ");
  return { compte: null, nouvelle: false, raison: `budget Upwork du jour atteint (${detail})` };
}
