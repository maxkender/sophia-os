import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 21, ajout : la fréquence des passages Upwork (0421). Réglée par
 * l'admin dans Overview → Switches ; doublée pour la journée après un 429.
 */
export type TacheUpwork = "accueil" | "reponses" | "etapes";
export const TACHES: readonly TacheUpwork[] = ["accueil", "reponses", "etapes"];
export const FREQUENCES = [15, 30, 60, 120] as const;
export const DEFAUTS: Record<TacheUpwork, number> = { accueil: 30, reponses: 30, etapes: 60 };

export interface EtatTache {
  tache: TacheUpwork;
  reglee: number;
  effective: number;
  dernier_at: string | null;
  dernier_429_at: string | null;
}

export interface EtatFrequences {
  taches: EtatTache[];
  appels_jour: number;
  limite: number;
  alerte: number;
}

export async function lireEtatFrequences(): Promise<EtatFrequences> {
  const { data, error } = await supabase.rpc("frequences_upwork_etat");
  if (error) throw error;
  return data as EtatFrequences;
}

export async function enregistrerFrequences(v: Record<TacheUpwork, number>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "upwork_frequences", valeur: v, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** « 30 min », « 1 h », « 2 h ». */
export function libelleMinutes(m: number): string {
  return m < 60 ? `${m} min` : `${m / 60} h`;
}
