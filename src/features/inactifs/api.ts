import { supabase } from "@/lib/supabase/client";

/** Inactifs (v3, 0385) : marqués chaque matin à 7 h, proposés en Kill le samedi. */
export interface Inactif {
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  depuis: string;
  jours_sans_post: number;
  nudges_sans_reponse: number;
  dernier_post_at: string | null;
  maj_at: string;
  upwork_contrat_url: string | null;
  kill_propose: boolean;
  kill_decide: string | null;
}

export interface ReglagesInactifs {
  inactif_jours_sans_post: number;
  inactif_nudges_sans_reponse: number;
}

export async function lireInactifs(): Promise<Inactif[]> {
  const { data, error } = await supabase.rpc("inactifs_liste");
  if (error) throw error;
  return (data ?? []) as Inactif[];
}

/** Relancer l'agent tout de suite (il passe aussi chaque matin à 7 h). */
export async function recalculerInactifs(): Promise<{ inactifs: number; nouveaux: number; sortis: number }> {
  const { data, error } = await supabase.rpc("inactifs_marquer");
  if (error) throw error;
  return data as { inactifs: number; nouveaux: number; sortis: number };
}

export async function lireReglagesInactifs(): Promise<ReglagesInactifs> {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["inactif_jours_sans_post", "inactif_nudges_sans_reponse"]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, Number(r.valeur)]));
  return {
    inactif_jours_sans_post: Number.isFinite(v.inactif_jours_sans_post) ? v.inactif_jours_sans_post : 2,
    inactif_nudges_sans_reponse: Number.isFinite(v.inactif_nudges_sans_reponse) ? v.inactif_nudges_sans_reponse : 2,
  };
}

export async function enregistrerReglagesInactifs(r: ReglagesInactifs): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("reglages").upsert([
    { cle: "inactif_jours_sans_post", valeur: r.inactif_jours_sans_post, ...par },
    { cle: "inactif_nudges_sans_reponse", valeur: r.inactif_nudges_sans_reponse, ...par },
  ]);
  if (error) throw error;
}
