import { supabase } from "@/lib/supabase/client";

/** Une recréation du compte du posteur connecté (0368), des 10 derniers jours. */
export interface MaRecreation {
  ancien_handle: string | null;
  nouveau_handle: string | null;
  /** Jour de la recréation (AAAA-MM-JJ, Paris). */
  le: string;
  /** Lundi des premiers posts du nouveau compte. */
  lundi: string;
}

export async function mesRecreations(): Promise<MaRecreation[]> {
  const { data, error } = await supabase.rpc("ckd_mes_recreations");
  if (error) throw error;
  return (data ?? []) as MaRecreation[];
}
