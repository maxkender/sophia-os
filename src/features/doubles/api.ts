import { supabase } from "@/lib/supabase/client";

import type { LigneDouble } from "./logique";

export async function lireDoubles(depuis?: string): Promise<LigneDouble[]> {
  const { data, error } = await supabase.rpc("doubles_suivi", depuis ? { p_depuis: depuis } : {});
  if (error) throw error;
  return (data ?? []) as LigneDouble[];
}
