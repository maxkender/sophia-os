/**
 * Système du 2 nov., partie C : l'arrêt complet d'un posteur. Rien ici ne
 * touche la base ni le réseau : le plan des actions et le journal.
 *
 * Jamais posté (pendant l'accueil) :
 *   os            désactivé dans l'OS (plus de messages ni de posts)
 *   message       dernier message sur Upwork (« Your contract has ended… »)
 *   jalons        milestones non financées supprimées
 *   remboursement milestone financée : l'API ne rembourse pas → « Ask for a
 *                 refund » dans la liste de paie (comme 0395)
 *   fermeture     contrat fermé par l'API s'il ne reste rien de financé,
 *                 sinon après le remboursement (liste de paie)
 *   slack         le retirer de Slack : liste « À retirer de Slack »
 * Déjà posté (en cours de route) : désactivé ; lundi, la liste de paie paie
 * la semaine en cours, ne finance rien et ferme le contrat (« paie »).
 *
 * Un échec ne bloque pas les autres actions ; chacune est journalisée.
 */
import type { JalonUpwork } from "./paiement.ts";
import { ETATS_FINANCES } from "./upwork.ts";

export type ActionArret = "os" | "message" | "jalons" | "remboursement" | "fermeture" | "slack" | "paie";
export type StatutAction = "fait" | "simule" | "erreur" | "a_faire" | "sans_objet";

export interface EtapeArret {
  action: ActionArret;
  statut: StatutAction;
  detail: string | null;
  at: string;
}

export interface PlanUpwork {
  /** Milestones à supprimer (pas financées). */
  supprimer: JalonUpwork[];
  /** Milestones financées et pas payées : à rembourser à la main. */
  rembourser: JalonUpwork[];
  /** Le contrat peut être fermé par l'API (plus rien de financé après suppression). */
  fermer: boolean;
}

/**
 * Les milestones lues par `lireJalonsContrat` (paiement.ts). Aucune milestone
 * lue : jamais de fermeture (un contrat a toujours au moins sa 1re semaine ;
 * une liste vide veut dire une lecture ratée).
 */
export function planUpwork(jalons: JalonUpwork[]): PlanUpwork {
  const supprimer = jalons.filter((j) => j.etat === "NotFunded");
  const rembourser = jalons.filter((j) => ETATS_FINANCES.includes(j.etat));
  return { supprimer, rembourser, fermer: jalons.length > 0 && rembourser.length === 0 };
}

export const MESSAGE_FIN_DEFAUT = "Your contract has ended. Thank you for your time.";
/** « Job canceled for other reasons » (reasons(reasonType: CONTRACT_END_FIXED), lu le 28/10). */
export const RAISON_FIN_DEFAUT = "107";

export const MUTATION_SUPPRIMER_JALON = `mutation SupprimerJalon($input: DeleteMilestoneInput!) { deleteMilestone(input: $input) }`;
export const MUTATION_FERMER_CONTRAT =
  `mutation FermerContrat($contractId: ID!, $input: EndContractInput!) { endContractByClient(contractId: $contractId, input: $input) { success } }`;

export function etape(action: ActionArret, statut: StatutAction, detail: string | null = null, at = new Date()): EtapeArret {
  return { action, statut, detail, at: at.toISOString() };
}

/** Le statut de l'arrêt : en erreur si une action a échoué, sinon fait. */
export function statutArret(etapes: EtapeArret[]): "fait" | "erreur" {
  return etapes.some((e) => e.statut === "erreur") ? "erreur" : "fait";
}

/** « Week 45 ($30) » : pour le journal et la liste de paie. */
export function decrireJalons(jalons: JalonUpwork[]): string {
  return jalons.map((j) => `${j.nom || j.id}${j.depot !== null ? ` ($${j.depot})` : ""}`).join(", ");
}
