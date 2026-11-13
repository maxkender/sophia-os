/** L'état de la boucle de correction par langue (0633), pour le bandeau. */
import { supabase } from "@/lib/supabase/client";

export interface BoucleLangue {
  langue: string;
  relecteurs: number;
  envoyes_7j: number;
  a_relire: number;
  relus_7j: number;
  duels_a_voter: number;
  proposees: number;
  retenues: number;
  retenues_7j: number;
  reprises_pct: number | null;
  reprises_pct_avant: number | null;
}

export const CLE_BOUCLE = ["boucle-etat"] as const;

export async function etatBoucle(): Promise<BoucleLangue[]> {
  const { data, error } = await supabase.rpc("boucle_etat");
  if (error) throw error;
  return (data ?? []) as BoucleLangue[];
}
