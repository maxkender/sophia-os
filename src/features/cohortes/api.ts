import { supabase } from "@/lib/supabase/client";

/**
 * Cohortes (prompt 17, partie B, 0392). Admin et Head of Ops voient tout ;
 * une HM ne reçoit que ses recrues (la base filtre).
 */

export interface CohorteResume {
  lundi: string;
  recrues: number;
  /** Recrues avec un rouge pas encore décidé. */
  rouges: number;
}

export async function lireCohortes(): Promise<CohorteResume[]> {
  const { data, error } = await supabase.rpc("cohortes_liste");
  if (error) throw error;
  return (data ?? []) as CohorteResume[];
}

export interface CompteSemaine1 {
  compte_id: string;
  handle: string | null;
  is_active: boolean;
  prevus: number;
  publies: number;
  publies_lun_mar: number;
}

export interface RecrueCohorte {
  poster_id: string;
  nom: string | null;
  pays: string | null;
  hm_id: string | null;
  hm_prenom: string | null;
  /** Contrat Upwork relié (id ou lien). */
  contrat: boolean;
  is_active: boolean;
  offre_at: string;
  cohorte_lundi: string;
  premiere_connexion_at: string | null;
  slack_lie: boolean;
  slack_lie_at: string | null;
  compte_id: string | null;
  handle: string | null;
  /** Dernier relevé du profil TikTok avant le lundi de la cohorte. */
  tiktok_existe: boolean | null;
  tiktok_vu_at: string | null;
  abonnements: number | null;
  warmup_started_at: string | null;
  warmup_reposts_at: string | null;
  semaine1: CompteSemaine1[];
  samedi: { regle: string; action: string; decision: string | null; compte_id: string }[];
  nudges: { type: string; periode: string | null; envoye_at: string; canal: string; resolu_at: string | null; erreur: string | null }[];
  prevues: { type: string; periode: string; statut: "prevu" | "bloque"; canal: string | null; raison: string | null }[];
  rouges: { etape: string; periode: string; rouge_at: string; decision: "reporter" | "arreter" | null; decision_at: string | null }[];
}

export async function lireRecrues(lundis: readonly string[]): Promise<RecrueCohorte[]> {
  if (lundis.length === 0) return [];
  const { data, error } = await supabase.rpc("cohorte_recrues", { p_lundis: [...lundis] });
  if (error) throw error;
  return ((data ?? []) as RecrueCohorte[]).map((r) => ({
    ...r,
    semaine1: r.semaine1 ?? [],
    samedi: r.samedi ?? [],
    nudges: r.nudges ?? [],
    prevues: r.prevues ?? [],
    rouges: r.rouges ?? [],
  }));
}

/** Reporter : cohorte + 1 semaine. Rend le nouveau lundi. */
export async function reporterRecrue(posterId: string): Promise<string> {
  const { data, error } = await supabase.rpc("cohorte_reporter", { p_poster: posterId });
  if (error) throw error;
  return data as string;
}

/** Arrêter : posteur désactivé, « End the contract » dans la liste de paie du lundi. */
export async function arreterRecrue(posterId: string): Promise<void> {
  const { error } = await supabase.rpc("cohorte_arreter", { p_poster: posterId });
  if (error) throw error;
}
