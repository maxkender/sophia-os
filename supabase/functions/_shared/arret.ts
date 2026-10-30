/**
 * L'arrêt complet d'un posteur, en deux temps (0463), sans aucun message.
 * Rien ici ne touche la base ni le réseau : le plan des actions et le journal.
 *
 * Samedi, à Validate (base, trigger arrets_immediat, sans API) :
 *   os            désactivé dans l'OS (plus de messages ni de posts)
 *   slack         liste « To remove from Slack » (Logs & to do), tout de suite
 * Lundi, après la paie (fonction upwork, si le test de fermeture est bon) :
 *   jalons        milestones non financées supprimées
 *   remboursement milestone financée d'une semaine à 0 $ : « Ask for a
 *                 refund » dans la liste de paie
 *   fermeture     contrat fermé par l'API
 * « message » ne sert plus qu'aux anciens arrêts (aucun message au Kill).
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
  // Prompt 21, B7 : fermer seulement si chaque état est connu (un état inconnu : rien).
  const connus = jalons.every((j) => ETATS_CONNUS.includes(j.etat));
  return { supprimer, rembourser, fermer: jalons.length > 0 && rembourser.length === 0 && connus };
}

/** Les états de milestone lus chez Upwork (29/10) ; tout autre bloque la fermeture. */
export const ETATS_CONNUS = ["NotFunded", "Active", "Submitted", "Rejected", "Paid", "PaidByUpwork", "PaidBySystem"];

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

// ---------------------------------------------------------------------------
// Prompt 21, partie F : la fin du contrat après la dernière semaine (0414)
// ---------------------------------------------------------------------------

/** Ce que `arrets_fins_a_faire` dit de la semaine du Kill. */
export interface SemaineKill {
  /** Montant de la ligne de paie (corrigé s'il l'a été) ; null : pas de ligne. */
  montant: number | null;
  paye_at: string | null;
  /** Posts publiés avec leur lien cette semaine-là. */
  posts: number;
}

/** Payée (API ou case « Payé ») → on termine ; à 0 $ → on termine aussi ; sinon on attend la paie. */
export function etatSemaineKill(s: SemaineKill): "payee" | "zero" | "attendre" {
  if (s.paye_at) return "payee";
  if (s.montant === 0 || (s.montant === null && s.posts === 0)) return "zero";
  return "attendre";
}

/**
 * Terminer le contrat ? Jamais tant qu'une milestone financée reste (elle n'est
 * pas payée), sauf la semaine à 0 $ : l'argent en séquestre devient une
 * demande de remboursement et le contrat se termine quand même.
 */
export function planFinContrat(plan: PlanUpwork, semaine: "payee" | "zero"): { fermer: boolean; raison: string | null } {
  if (!plan.fermer && plan.rembourser.length === 0) return { fermer: false, raison: "aucune milestone lue : contrat à terminer à la main" };
  if (semaine === "payee" && plan.rembourser.length > 0) {
    return { fermer: false, raison: `encore financé : ${decrireJalons(plan.rembourser)} (à payer ou rembourser, puis terminer)` };
  }
  return { fermer: true, raison: null };
}

/** `kill_message_auto` (0413) : off / test / on ; l'ancien oui / non = on / off ; inconnu = off. */
export function modeKillMessage(v: unknown): "off" | "test" | "on" {
  if (v === true || v === "on") return "on";
  if (v === "test") return "test";
  return "off";
}
