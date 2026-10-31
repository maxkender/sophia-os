import { supabase } from "@/lib/supabase/client";

export interface Annonce {
  id: string;
  texte: string;
  cree_at: string;
}

export async function lireAnnonces(): Promise<Annonce[]> {
  const { data, error } = await supabase.rpc("mes_annonces");
  if (error) throw error;
  return (data ?? []) as Annonce[];
}

export async function annonceVue(id: string): Promise<void> {
  const { error } = await supabase.rpc("annonce_vue", { p_id: id });
  if (error) throw error;
}
