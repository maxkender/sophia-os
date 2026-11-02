import { invoke } from "@/features/moteur/api";
import { ignorerQuestionFaq, traiterQuestionFaq } from "@/features/chatbot/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 21, partie U : « Needs you ». Tout vient de needs_you() (0419) ; les
 * corrections passent par needs_you_agir(), la FAQ par faq-admin et le relevé
 * d'un handle corrigé par ckd (releve_compte).
 */
export type Categorie = "pas_pu_repondre" | "bloque" | "pas_sur" | "a_la_main";
export type Urgence = "lundi" | "paie" | "kill" | "rien";

export const CATEGORIES: readonly Categorie[] = ["pas_pu_repondre", "bloque", "pas_sur", "a_la_main"];
export const URGENCES: readonly Urgence[] = ["lundi", "paie", "kill", "rien"];

export interface CasNeedsYou {
  cle: string;
  categorie: Categorie;
  type: string;
  poster_id: string | null;
  nom: string | null;
  cohorte: string | null;
  hm: string | null;
  pays: string | null;
  vu: string | null;
  pense: string | null;
  confiance: number | null;
  urgence: Urgence;
  rang: number;
  cree_at: string;
  actions: string[];
  ref: string | null;
  lien: string | null;
  valeur: string | null;
  compteur: number;
  contestation: boolean;
}

export interface CompteNeedsYou {
  total: number;
  urgents: number;
  pas_pu_repondre: number;
  bloque: number;
  pas_sur: number;
  a_la_main: number;
}

export async function lireNeedsYou(): Promise<CasNeedsYou[]> {
  const { data, error } = await supabase.rpc("needs_you");
  if (error) throw error;
  return ((data ?? []) as CasNeedsYou[]).map((c) => ({ ...c, confiance: c.confiance === null ? null : Number(c.confiance) }));
}

export async function lireCompteNeedsYou(): Promise<CompteNeedsYou> {
  const { data, error } = await supabase.rpc("needs_you_compte");
  if (error) throw error;
  return data as CompteNeedsYou;
}

export async function agirNeedsYou(cle: string, action: string, valeur?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc("needs_you_agir", { p_cle: cle, p_action: action, p_valeur: valeur ?? null });
  if (error) throw error;
  return String(data ?? "");
}

/** Un handle corrigé est relevé tout de suite (la recrue avance au relevé). */
export async function releverCompte(compteId: string): Promise<{ existe: boolean | null }> {
  const r = await invoke<{ ok: boolean; existe?: boolean | null; error?: string }>("ckd", { action: "releve_compte", compte_id: compteId });
  if (!r.ok) throw new Error(r.error ?? "relevé impossible");
  return { existe: r.existe ?? null };
}

/**
 * Une question hors FAQ (et ses doublons) : la réponse part à chacun, et la
 * 1re entre dans la FAQ.
 */
export async function repondreQuestions(ids: string[], reponse: string): Promise<void> {
  for (const [i, id] of ids.entries()) await traiterQuestionFaq(id, reponse, i === 0);
}

export async function ignorerQuestions(ids: string[]): Promise<void> {
  for (const id of ids) await ignorerQuestionFaq(id);
}
