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
  en_retard: boolean;
}

export async function lireEnvoisMain(): Promise<EnvoiMain[]> {
  const { data, error } = await supabase.rpc("envois_main_liste");
  if (error) throw error;
  return (data ?? []) as EnvoiMain[];
}

/** « Sent » : noté parti sur Upwork, par la HM. */
export async function marquerEnvoye(m: Pick<EnvoiMain, "poster_id" | "type" | "periode">): Promise<void> {
  const { error } = await supabase.rpc("envoi_main_fait", { p_poster: m.poster_id, p_type: m.type, p_periode: m.periode });
  if (error) throw error;
}
