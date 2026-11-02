import { supabase } from "@/lib/supabase/client";

import type { ReleveWarmup } from "../cohorte/api";

/**
 * « Semaine prochaine » (0371) : les comptes qui font leurs premiers posts le
 * lundi qui vient, premiers comptes, comptes recréés et 2ᵉ comptes d'un
 * Double compris. Une HM ne reçoit que ses posteurs ; l'admin et le Head of
 * Ops reçoivent tout.
 */

export type TypeCompteSemaine = "premier" | "recree" | "double";

export interface CompteSemaine {
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  handle: string | null;
  pays: string | null;
  type: TypeCompteSemaine;
  /** Le compte remplacé, pour un recréé. */
  ancien_handle: string | null;
  is_active: boolean;
  cree_le: string;
  warmup_lance_le: string | null;
  warmup_fin: string | null;
  /** « J'ai fait 2 reposts » coché par le posteur (0365). */
  reposts_le: string | null;
  releves: ReleveWarmup[];
}

export async function lireSemaineProchaine(lundi: string): Promise<CompteSemaine[]> {
  const { data, error } = await supabase.rpc("hm_semaine_prochaine", { p_lundi: lundi });
  if (error) throw error;
  return ((data ?? []) as CompteSemaine[]).map((c) => ({ ...c, releves: c.releves ?? [] }));
}
