import { supabase } from "@/lib/supabase/client";

/** 6/11 (0551) : un type de message automatique, et les « What does it mean » reçus après. */
export interface TexteIncompris {
  type: string;
  envoyes: number;
  posteurs: number;
  incompris: number;
  dernier_texte: string | null;
  dernier_at: string | null;
  exemples: { at: string; texte: string }[];
}

export async function lireTextesIncompris(jours: number): Promise<TexteIncompris[]> {
  const { data, error } = await supabase.rpc("textes_auto_incompris", { p_jours: jours });
  if (error) throw error;
  return (data ?? []) as TexteIncompris[];
}

/** Le taux d'incompris en %, arrondi ; « — » sans envoi. */
export function tauxIncompris(t: Pick<TexteIncompris, "envoyes" | "incompris">): string {
  return t.envoyes > 0 ? `${Math.round((t.incompris * 100) / t.envoyes)} %` : "—";
}
