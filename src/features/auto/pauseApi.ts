import { supabase } from "@/lib/supabase/client";

/** Prompt 22 (0412) : le grand interrupteur, lu par la bande rouge et Overview. */
export interface EtatPause {
  actif: boolean;
  depuis: string | null;
  par_nom: string | null;
}

export async function lireEtatPause(): Promise<EtatPause> {
  const { data, error } = await supabase.rpc("automation_pause_etat");
  if (error) throw error;
  const l = ((data ?? []) as EtatPause[])[0];
  return l ?? { actif: false, depuis: null, par_nom: null };
}

/** Admin seulement (vérifié en base, 0412). */
export async function ecrirePause(actif: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "automation_pause", valeur: actif, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "cle" });
  if (error) throw error;
}
