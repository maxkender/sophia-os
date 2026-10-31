import { supabase } from "@/lib/supabase/client";

/** 0489 : la dernière relance d'une recrue (étape, canal, heure) et « Upwork prévu à ». */
export interface RelanceRecrue {
  poster_id: string;
  etape: string | null;
  canal: "slack" | "upwork";
  envoye_at: string;
  upwork_prevu_at: string | null;
}

export async function lireRelances(): Promise<Map<string, RelanceRecrue>> {
  const { data, error } = await supabase.rpc("relances_etat");
  if (error) throw error;
  return new Map(((data ?? []) as RelanceRecrue[]).map((r) => [r.poster_id, r]));
}

export async function lireCompteurRelances(): Promise<{ slack: number; upwork: number }> {
  const { data, error } = await supabase.rpc("relances_compteur_jour");
  if (error) throw error;
  const l = ((data ?? []) as { slack: number; upwork: number }[])[0];
  return { slack: l?.slack ?? 0, upwork: l?.upwork ?? 0 };
}
