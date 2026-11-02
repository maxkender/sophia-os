/**
 * Prompt 21, ajout : la fréquence des passages Upwork, réglable dans Overview
 * (upwork_frequences, 0421). Les crons tournent toutes les 15 minutes ; chaque
 * fonction demande ici si c'est son tour. Un 429 d'Upwork double l'intervalle
 * pour la journée.
 */
// deno-lint-ignore no-explicit-any
type Supabase = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export type TacheUpwork = "accueil" | "reponses" | "etapes";

/** Est-ce le tour de cette tâche ? (le passage est noté s'il l'est). En cas d'erreur : oui, comme avant. */
export async function passageDu(supabase: Supabase, tache: TacheUpwork): Promise<boolean> {
  const { data, error } = await supabase.rpc("passage_du", { p_tache: tache });
  if (error) {
    console.error("[frequences]", tache, error.message);
    return true;
  }
  return data === true;
}

/** Upwork a répondu 429 : l'intervalle doublé pour la journée, signalé dans Needs you. */
export async function noter429(supabase: Supabase, tache: TacheUpwork | null): Promise<void> {
  const { error } = await supabase.rpc("passage_429", { p_tache: tache });
  if (error) console.error("[frequences] 429", error.message);
}
