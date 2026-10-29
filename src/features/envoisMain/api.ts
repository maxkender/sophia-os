import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 25 v4 (0442) : « To send by hand ». Upwork plein (Max et Adrien) :
 * le message va à la HM de la recrue, qui l'envoie elle-même dans la
 * conversation du contrat puis clique « Sent ». La HM voit les siens,
 * l'admin et le Head of Ops tous.
 */
export interface EnvoiMain {
  poster_id: string;
  type: string;
  periode: string;
  nom: string | null;
  hm_id: string | null;
  hm_nom: string | null;
  contrat_id: string | null;
  salon_url: string | null;
  texte: string | null;
  priorite: number;
  main_at: string;
  /**
   * Prompt 25 MAJ, point 8 (0448) : a_envoyer, en_retard (6 h), sent (Sent
   * cliqué, en vérification), verifie (vu sur Upwork), sent_introuvable (Sent
   * cliqué, rien sur Upwork 1 h après).
   */
  statut_tache: "a_envoyer" | "en_retard" | "sent" | "verifie" | "sent_introuvable";
  main_envoye_at: string | null;
  main_verif_at: string | null;
  main_rappel_at: string | null;
}

export async function lireEnvoisMain(): Promise<EnvoiMain[]> {
  const { data, error } = await supabase.rpc("envois_main_v2");
  if (error) throw error;
  return (data ?? []) as EnvoiMain[];
}

/** Une tâche encore à faire par la HM (pas encore « Sent » ni vue sur Upwork). */
export const aFaire = (m: Pick<EnvoiMain, "statut_tache">) => m.statut_tache === "a_envoyer" || m.statut_tache === "en_retard";

/** Par HM : à envoyer maintenant ; créés, envoyés, vérifiés, en retard, aujourd'hui et sur 7 jours. */
export interface CompteursHm {
  hm_id: string | null;
  hm_nom: string | null;
  a_envoyer: number;
  crees_jour: number;
  envoyes_jour: number;
  verifies_jour: number;
  retard_jour: number;
  crees_7j: number;
  envoyes_7j: number;
  verifies_7j: number;
  retard_7j: number;
}

export async function lireCompteursHm(): Promise<CompteursHm[]> {
  const { data, error } = await supabase.rpc("envois_main_compteurs");
  if (error) throw error;
  return (data ?? []) as CompteursHm[];
}

/** « Sent » : noté parti sur Upwork, par la HM. */
export async function marquerEnvoye(m: Pick<EnvoiMain, "poster_id" | "type" | "periode">): Promise<void> {
  const { error } = await supabase.rpc("envoi_main_fait", { p_poster: m.poster_id, p_type: m.type, p_periode: m.periode });
  if (error) throw error;
}
