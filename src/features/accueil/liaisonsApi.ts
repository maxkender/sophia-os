import { supabase } from "@/lib/supabase/client";

/** Prompt 21, A4 (0413) : une suggestion par le nom, ou une liaison faite sans accueil ni lien exact. */
export interface LiaisonContrat {
  poster_id: string;
  poster_nom: string | null;
  contrat_id: string;
  freelancer_nom: string | null;
  /** 1 noms identiques, 2 tous les mots, 3 à 2 lettres près, 4 2e compte ; null : aucun rapport. */
  regle: number | null;
  pays?: string | null;
  partage?: boolean;
}

export async function lireSuggestions(): Promise<LiaisonContrat[]> {
  const { data, error } = await supabase.rpc("contrats_suggestions");
  if (error) throw error;
  return (data ?? []) as LiaisonContrat[];
}

export async function lireLiaisonsAVerifier(): Promise<LiaisonContrat[]> {
  const { data, error } = await supabase.rpc("liaisons_a_verifier");
  if (error) throw error;
  return (data ?? []) as LiaisonContrat[];
}

export async function confirmerSuggestion(posterId: string, contratId: string): Promise<void> {
  const { error } = await supabase.rpc("contrat_lier", { p_poster: posterId, p_contrat: contratId });
  if (error) throw error;
}

export async function verifierLiaison(posterId: string, delier: boolean): Promise<void> {
  const { error } = await supabase.rpc("liaison_verifier", { p_poster: posterId, p_delier: delier });
  if (error) throw error;
}
