import { supabase } from "@/lib/supabase/client";

import type { ActionCkd, RegleCkd } from "../api";

/**
 * La page Decisions (chantier du 28 oct., 0396) : les propositions à décider
 * maintenant (Kill, Double, Recréer) et les nombres de la semaine.
 */

export interface ADecider {
  id: string;
  type: "jeudi" | "samedi";
  jour: string;
  regle: RegleCkd;
  action: Exclude<ActionCkd, "nudge">;
  compte_id: string;
  handle: string | null;
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  pays: string | null;
  donnees: Record<string, unknown>;
  /** La relance du mercredi de la semaine (inactifs). */
  mercredi_at: string | null;
}

export async function lireADecider(): Promise<ADecider[]> {
  const { data, error } = await supabase.rpc("decisions_a_prendre");
  if (error) throw error;
  return (data ?? []) as ADecider[];
}

export interface SemaineDecisions {
  mercredi: { envoyes: number };
  jeudi: { calcule: boolean; propositions: number; a_decider: number };
  samedi: { calcule: boolean; propositions: number; a_decider: number };
  dimanche: { prevus: number; faits: number };
  lundi: { lignes: number; payees: number };
}

export async function lireSemaine(lundi: string): Promise<SemaineDecisions> {
  const { data, error } = await supabase.rpc("decisions_semaine", { p_lundi: lundi });
  if (error) throw error;
  return data as SemaineDecisions;
}
