import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/** Nudge all (v3, 0384). */
export type CibleNudge = "warmup" | "premiere_semaine" | "actifs";
export type TypeBlocage = "warmup_pas_lance" | "compte_introuvable" | "reposts" | "abonnements" | "posts_manques";
export const TYPES_BLOCAGE: readonly TypeBlocage[] = [
  "warmup_pas_lance",
  "compte_introuvable",
  "reposts",
  "abonnements",
  "posts_manques",
];

export interface CibleNudgeLigne {
  poster_id: string;
  poster_nom: string | null;
  hm_id: string | null;
  hm_prenom: string | null;
  compte_id: string;
  handle: string | null;
  type: TypeBlocage;
  n: number;
  texte: string;
  slack: boolean;
  nudges_sans_reponse: number;
}

export interface NudgeEnvoye {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  compte_id: string | null;
  handle: string | null;
  type: TypeBlocage;
  canal: "slack" | "os";
  texte: string;
  envoye_at: string;
  reponse_at: string | null;
  resolu_at: string | null;
  upwork_relance_at: string | null;
  slack_erreur: string | null;
}

export interface ARelancerUpwork {
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  upwork_contrat_url: string | null;
  upwork_url: string | null;
  nudges: number;
  dernier_at: string;
  types: TypeBlocage[];
}

export async function apercuNudges(cible: CibleNudge, hm: string | null): Promise<CibleNudgeLigne[]> {
  const { data, error } = await supabase.rpc("nudge_cibles", { p_cible: cible, p_hm: hm || null });
  if (error) throw error;
  return (data ?? []) as CibleNudgeLigne[];
}

export async function envoyerNudges(
  cible: CibleNudge,
  hm: string | null,
  comptes: string[],
): Promise<{ envoyes: number; slack: number; os: number; erreurs: string[] }> {
  return await invoke("nudges", { action: "envoyer", cible, hm: hm || null, comptes });
}

export async function lireNudges(depuis: string): Promise<NudgeEnvoye[]> {
  const { data, error } = await supabase.rpc("nudges_liste", { p_depuis: depuis });
  if (error) throw error;
  return (data ?? []) as NudgeEnvoye[];
}

export async function lireARelancerUpwork(): Promise<ARelancerUpwork[]> {
  const { data, error } = await supabase.rpc("nudges_a_relancer_upwork");
  if (error) throw error;
  return (data ?? []) as ARelancerUpwork[];
}

/** « A répondu » (un nudge) ou « Relancé sur Upwork » (un posteur). */
export async function marquerNudge(id: string, quoi: "repondu" | "upwork"): Promise<void> {
  const { error } = await supabase.rpc("nudge_marquer", { p_id: id, p_quoi: quoi });
  if (error) throw error;
}

export async function lireMessagesNudge(): Promise<Record<TypeBlocage, string>> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "nudge_messages").maybeSingle();
  if (error) throw error;
  const v = (data?.valeur ?? {}) as Partial<Record<TypeBlocage, string>>;
  return Object.fromEntries(TYPES_BLOCAGE.map((t) => [t, v[t] ?? ""])) as Record<TypeBlocage, string>;
}

export async function enregistrerMessagesNudge(messages: Record<TypeBlocage, string>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("reglages").upsert({
    cle: "nudge_messages",
    valeur: messages,
    updated_by: auth.user?.id ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
