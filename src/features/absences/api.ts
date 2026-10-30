import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 27 : « I'll be away ». Le posteur déclare une absence ; l'OS la
 * note, rien d'autre (pas de pause, pas de message, ni paie ni décision).
 */
export interface MonAbsence {
  id: string;
  debut: string;
  fin: string;
  jours: number;
  raison: string | null;
}

export async function lireMonAbsence(): Promise<MonAbsence | null> {
  const { data, error } = await supabase.rpc("mon_absence");
  if (error) throw error;
  return (data ?? null) as MonAbsence | null;
}

export async function declarerAbsence(debut: string, jours: number, raison: string): Promise<MonAbsence | null> {
  const { data, error } = await supabase.rpc("absence_declarer", { p_debut: debut, p_jours: jours, p_raison: raison.trim() || null });
  if (error) throw error;
  return (data ?? null) as MonAbsence | null;
}

/** « I'm back » : l'absence se termine aujourd'hui (une absence à venir est annulée). */
export async function terminerAbsence(): Promise<void> {
  const { error } = await supabase.rpc("absence_retour");
  if (error) throw error;
}
