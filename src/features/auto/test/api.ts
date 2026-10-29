import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 25 v4 (0440) : les contrats de test. Sur ces contrats, la bienvenue
 * et les relances partent pour de vrai même sur Test ou Approve ; le posteur
 * « TEST {prénom} » et ses boutons « Run now ». Admin seulement.
 */
export interface ContratTest {
  contrat_id: string;
  ajoute_at: string;
  poster_id: string | null;
  poster_nom: string | null;
  poster_actif: boolean | null;
  cohorte_lundi: string | null;
  slack: boolean | null;
  email: string | null;
}

export async function lireContratsTest(): Promise<ContratTest[]> {
  const { data, error } = await supabase.rpc("contrats_test_liste");
  if (error) throw error;
  return (data ?? []) as ContratTest[];
}

/** L'id ou le lien du contrat ; refusé s'il est relié à un vrai posteur actif. Rend l'id. */
export async function ajouterContratTest(contrat: string): Promise<string> {
  const { data, error } = await supabase.rpc("contrat_test_ajouter", { p_contrat: contrat.trim() });
  if (error) throw error;
  return data as string;
}

export async function retirerContratTest(contrat: string): Promise<void> {
  const { error } = await supabase.rpc("contrat_test_retirer", { p_contrat: contrat });
  if (error) throw error;
}

/** « Create test poster » : « TEST {prénom} », relié au contrat, cohorte du lundi suivant. */
export async function creerPosteurTest(contrat: string, prenom: string): Promise<{ poster_id: string; email: string | null; nom: string }> {
  const r = await invoke<{ ok: boolean; error?: string; poster_id?: string; email?: string | null; nom?: string }>("recrues-check", {
    action: "test_poster_creer", contrat_id: contrat, prenom,
  });
  if (!r.ok || !r.poster_id) throw new Error(r.error ?? "création impossible");
  return { poster_id: r.poster_id, email: r.email ?? null, nom: r.nom ?? "" };
}

/** Ce que « Run now » envoie au posteur de test (ou « reset »). */
export const LANCEMENTS_TEST = ["accueil", "etape0", "etape1", "etape2", "etape3", "etape4", "lundi_soir", "secours", "reset"] as const;
export type LancementTest = (typeof LANCEMENTS_TEST)[number];

export interface BilanLancement {
  ok: boolean;
  error?: string;
  partis?: string[];
  erreurs?: string[];
  texte?: string;
}

export async function lancerTest(posterId: string, quoi: LancementTest): Promise<BilanLancement> {
  return await invoke<BilanLancement>("recrues-check", { action: "test_lancer", poster_id: posterId, quoi });
}
