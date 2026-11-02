import { supabase } from "@/lib/supabase/client";

/**
 * « Contracts to end » (0397) : les contrats Upwork à terminer pour la
 * semaine payée, chaque Kill du dimanche et chaque Stop de Cohorts.
 */
export interface ContratATerminer {
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  contrat_url: string | null;
  contrat_id: string | null;
  source: "kill" | "stop";
  decide_at: string;
  /** Les comptes tués (Kill), vide pour un Stop. */
  handles: string[];
  /** Comptes perso encore actifs, hors comptes tués. */
  autres_actifs: number;
  termine_at: string | null;
  termine_par: string | null;
}

export async function lireContratsATerminer(lundi: string): Promise<ContratATerminer[]> {
  const { data, error } = await supabase.rpc("contrats_a_terminer", { p_lundi: lundi });
  if (error) throw error;
  return ((data ?? []) as ContratATerminer[]).map((c) => ({
    ...c,
    handles: c.handles ?? [],
    autres_actifs: Number(c.autres_actifs ?? 0),
  }));
}

/** « Ended » : qui et quand sont gardés ; décocher l'efface. */
export async function marquerContratTermine(posterId: string, lundi: string, termine: boolean): Promise<void> {
  const { error } = await supabase.rpc("contrat_marquer_termine", { p_poster: posterId, p_lundi: lundi, p_termine: termine });
  if (error) throw error;
}
