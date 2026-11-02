import { supabase } from "@/lib/supabase/client";

/**
 * Postpone (0367) : le compte passe à la cohorte suivante. Ses posts pas
 * encore publiés sont retirés et son warm-up finit le lundi d'après. Rend ce
 * lundi (AAAA-MM-JJ). Refusé si le compte a déjà publié ou si son warm-up
 * n'est pas lancé.
 */
export async function reporterCompte(compteId: string): Promise<string> {
  const { data, error } = await supabase.rpc("cohorte_reporter_compte", { p_compte: compteId });
  if (error) throw error;
  return data as string;
}
