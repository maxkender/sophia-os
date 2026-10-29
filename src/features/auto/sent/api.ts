import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 22, partie 6 : le journal de tous les messages que l'OS envoie
 * (`messages_envoyes`, 0427) : relances, bienvenue, lundi, jeudi, Kill, arrêt,
 * réponses automatiques, pop-ups et notes du tableau de bord, bloqués par la
 * pause.
 */
export type EtatMessage = "envoye" | "simule" | "pause" | "bloque" | "erreur";
export const ETATS_MESSAGE: readonly EtatMessage[] = ["envoye", "simule", "pause", "bloque", "erreur"];

export interface MessageEnvoye {
  at: string;
  poster_id: string | null;
  poster_nom: string | null;
  /** L'étape ou le message (connexion, lundi_tous, jeudi, kill, bienvenue, reponse_auto, note:lien_1000, pause:accueil…). */
  type: string;
  /** upwork, slack, os (tableau de bord), ou la fonction bloquée par la pause. */
  canal: string;
  etat: EtatMessage;
  texte: string | null;
  detail: string | null;
  /** La réaction du posteur : repondu, resolu, lu, reponse_oui, reponse_non. */
  reaction: string | null;
  reaction_at: string | null;
  source: string;
  ref: string | null;
}

export async function lireMessagesEnvoyes(depuisIso: string): Promise<MessageEnvoye[]> {
  const { data, error } = await supabase.rpc("messages_envoyes", { p_depuis: depuisIso });
  if (error) throw error;
  return (data ?? []) as MessageEnvoye[];
}

/** Le message de l'OS auquel répond un message reçu : le dernier parti à ce posteur avant la réponse. */
export function messageRepondu(
  messages: readonly MessageEnvoye[],
  posterId: string,
  recuAt: string,
): MessageEnvoye | null {
  const limite = Date.parse(recuAt);
  let meilleur: MessageEnvoye | null = null;
  for (const m of messages) {
    if (m.poster_id !== posterId || m.etat !== "envoye" || m.type === "reponse_auto") continue;
    const at = Date.parse(m.at);
    if (at > limite) continue;
    if (!meilleur || at > Date.parse(meilleur.at)) meilleur = m;
  }
  return meilleur;
}
