import { supabase } from "@/lib/supabase/client";

import { appeler } from "./api";

/** 13/11 (Max) : page « Entraîner le bot » (0707). */

export type StatutType = "sur" | "pas_sur" | "sans_reponse" | "ok" | "a_revoir";
export type Choix = "ok" | "corriger" | "action" | "escalader";

export interface Exemple {
  qui: string | null;
  at: string;
  source: string;
  texte: string;
}

export interface QuestionType {
  id: string;
  question: string;
  categorie: string | null;
  priorite: number | null;
  nb: number;
  upwork: boolean;
  ruul: boolean;
  exemples: Exemple[];
  reponse_actuelle: string | null;
  statut: StatutType;
  choix: Choix | null;
  reponse_upwork: string | null;
  reponse_ruul: string | null;
  action: string | null;
  action_bot: string | null;
  escalade_vers: "adrien" | "max" | null;
  entraine_at: string | null;
  regroupe_at: string | null;
}

export interface ActionPossible {
  action: string;
  libelle: string;
  bot: string;
  actif: boolean;
  fois_7j: number;
}

export interface LigneDirect {
  id: string;
  cree_at: string;
  source: string;
  texte: string;
  nom: string;
  issue: "repondu" | "action" | "escalade" | "bloque";
  action_faite: string | null;
  niveau: string | null;
  ticket_at: string | null;
  remonte_par: string | null;
  regle_par_bot: string | null;
  bot_responsable: string | null;
}

export interface Direct {
  compteurs: Record<LigneDirect["issue"], number>;
  fil: LigneDirect[];
}

async function rpc<T>(nom: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  const r = data as T & { ok?: boolean; error?: string };
  if (r && typeof r === "object" && "ok" in r && r.ok === false) throw new Error(r.error ?? "erreur");
  return r;
}

export const lireQuestionsTypes = () => rpc<QuestionType[]>("entrainement_liste");
export const decider = (id: string, choix: Choix, args: Record<string, unknown> = {}) =>
  rpc<{ ok: true; entrees: string[] }>("entrainement_decider", { p_id: id, p_choix: choix, p_args: args });
export const lireActions = () => rpc<ActionPossible[]>("entrainement_actions");
export const activerAction = (action: string, actif: boolean) => rpc<{ ok: true }>("entrainement_action_activer", { p_action: action, p_actif: actif });
export const lireDirect = () => rpc<Direct>("entrainement_direct");
export const regrouper = () => appeler<{ ok: true; lues: number; types: number; crees?: number; mis_a_jour?: number }>({ action: "entrainement_regrouper" });

export const LIBELLE_STATUT: Record<StatutType, string> = {
  sur: "✅ sûr", pas_sur: "❓ pas sûr", sans_reponse: "❌ pas de réponse", ok: "✅ entraîné", a_revoir: "⚠️ à revoir",
};

/**
 * Les cartes à entraîner : les 4 cas de Max d'abord (priorité), puis ce qui n'est pas encore sûr ou
 * entraîné (à revoir, pas de réponse, pas sûr), du plus fréquent au moins fréquent.
 */
export function aEntrainer(liste: readonly QuestionType[]): QuestionType[] {
  return liste
    .filter((q) => (q.statut !== "ok" && q.statut !== "sur") || (q.priorite != null && !q.entraine_at))
    .sort((a, b) =>
      (a.priorite != null && !a.entraine_at ? a.priorite : 99) - (b.priorite != null && !b.entraine_at ? b.priorite : 99)
      || (a.statut === "a_revoir" ? 0 : 1) - (b.statut === "a_revoir" ? 0 : 1)
      || b.nb - a.nb);
}

/** Les actions qu'une carte « ⚡ Action » peut demander au bot (celles du cerveau support). */
export const ACTIONS_CARTE: readonly { action: string; libelle: string; modele: string }[] = [
  { action: "pseudo_tiktok", libelle: "Changer le @ TikTok (nouveau @ donné par le posteur)", modele: "Done! Your TikTok username is now updated on your dashboard." },
  { action: "lien_mot_de_passe", libelle: "Renvoyer le mot de passe", modele: "We've just sent you a link to set your password. Check your inbox (and spam)." },
  { action: "lien_slack", libelle: "Renvoyer le lien Slack", modele: "Here is the link to join our Slack. Sign up with your personal email and your full name." },
  { action: "email_ruul", libelle: "Changer l'email Ruul", modele: "We've updated your Ruul email. You'll receive a new invitation at this address." },
  { action: "invitation_ruul", libelle: "Réinviter sur Ruul", modele: "We've sent you a new Ruul invitation. Check your inbox (and spam)." },
  { action: "arret", libelle: "Transmettre un arrêt (STOP)", modele: "Understood, we've stopped your work with us. Thank you for your time." },
  { action: "renvoi_parrainage", libelle: "Renvoyer un parrainage", modele: "We've sent your referral invitation again." },
  { action: "prevenir_max", libelle: "Prévenir Max d'un bug", modele: "Thanks for telling us, the team is looking at it. Here is what you can do meanwhile:" },
];

export const BOTS_CARTE = ["cerveau support", "new_cohort_bot", "control_bot", "pay_bot", "ruul_bot"] as const;
