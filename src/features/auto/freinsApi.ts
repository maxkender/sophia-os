import { supabase } from "@/lib/supabase/client";

export interface FreinEnvoi {
  id: string;
  type: string;
  motif: "plafond_heure" | "deja_fait";
  detail: string | null;
  cree_at: string;
}

export async function lireFreins(): Promise<FreinEnvoi[]> {
  const { data, error } = await supabase.from("freins_envoi").select("id, type, motif, detail, cree_at").is("leve_at", null).order("cree_at");
  if (error) throw error;
  return (data ?? []) as FreinEnvoi[];
}

export async function leverFrein(id: string): Promise<void> {
  const { error } = await supabase.rpc("frein_lever", { p_id: id });
  if (error) throw error;
}
