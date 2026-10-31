import { supabase } from "@/lib/supabase/client";

/** 1/11 : les HM (et les DM) ne créent plus de posteurs ; l'admin et le Head of Ops oui. */
export const creationCoupeePour = (role: string | null | undefined) => role === "hiring_manager" || role === "directing_manager";

/** Le lien « My cohort », vers le posteur s'il existe déjà. */
export const lienMaCohorte = (posteurId?: string | null) =>
  posteurId ? `/manager/accueil?posteur=${encodeURIComponent(posteurId)}` : "/manager/accueil";

export interface PosteurTrouve {
  poster_id: string;
  nom: string | null;
  cohorte_lundi: string | null;
  hm_nom: string | null;
  contrat_id: string | null;
}

/** 0488 : le posteur qui existe déjà pour un lien de contrat Upwork ou un nom. */
export async function trouverPosteur(recherche: string): Promise<PosteurTrouve[]> {
  const { data, error } = await supabase.rpc("hm_trouver_posteur", { p_recherche: recherche });
  if (error) throw error;
  return (data ?? []) as PosteurTrouve[];
}
