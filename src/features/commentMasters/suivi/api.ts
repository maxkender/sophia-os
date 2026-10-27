import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/** Une demande de commentaire, attribuée au Comment Master du mandat (0373). */
export interface DemandeCm {
  id: string;
  langue: string;
  region: string | null;
  canal: string | null;
  slack_channel_id: string | null;
  slack_ts: string | null;
  publie_url: string | null;
  envoye_at: string;
  fait_at: string | null;
  fait_par: string | null;
  fait_source: string | null;
  fait_mode: string | null;
  /** Le commentaire a été retrouvé sous le post TikTok. */
  verifie: boolean;
  cm_profile_id: string | null;
  cm_nom: string | null;
  cm_slack_connu: boolean;
  autre_personne: boolean;
  autre_valide_at: string | null;
  /** Fait, et par le Comment Master (ou validé par l'admin). */
  compte: boolean;
}

export async function lireDemandesCm(debut: string, fin: string): Promise<DemandeCm[]> {
  const { data, error } = await supabase.rpc("cm_demandes", { p_debut: debut, p_fin: fin });
  if (error) throw error;
  return (data ?? []) as DemandeCm[];
}

export async function validerAutre(demande: string, valide: boolean): Promise<void> {
  const { error } = await supabase.rpc("cm_valider_autre", { p_demande: demande, p_valide: valide });
  if (error) throw error;
}

export interface ResultatSynchro {
  ok: boolean;
  canaux: number;
  lues: number;
  mises_a_jour: number;
  erreurs: { canal?: string; demande?: string; erreur: string }[];
}

export async function synchroniserSlack(): Promise<ResultatSynchro> {
  return await invoke<ResultatSynchro>("comment-masters", { action: "synchro_slack" });
}

export interface SynchroCm extends Omit<ResultatSynchro, "ok"> {
  debut: string;
  fin: string | null;
  auto: boolean;
}

export async function derniereSynchro(): Promise<SynchroCm | null> {
  const { data, error } = await supabase
    .from("comment_master_syncs")
    .select("debut, fin, auto, canaux, lues, mises_a_jour, erreurs")
    .order("debut", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as SynchroCm | null;
}

/** Les réglages des bonus (`reglages.bonus`), modifiables par l'admin. */
export interface ReglagesBonus {
  parrainage_montant: number;
  parrainage_semaines_min: number;
  parrainage_posts_min_semaine: number;
  comment_master_par_commentaire: number;
  premier_lundi: string;
}

export const REGLAGES_BONUS_DEFAUT: ReglagesBonus = {
  parrainage_montant: 0,
  parrainage_semaines_min: 2,
  parrainage_posts_min_semaine: 12,
  comment_master_par_commentaire: 0,
  premier_lundi: "2026-11-30",
};

export async function lireReglagesBonus(): Promise<ReglagesBonus> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "bonus").maybeSingle();
  if (error) throw error;
  const v = (data?.valeur ?? {}) as Partial<ReglagesBonus>;
  return {
    parrainage_montant: Number(v.parrainage_montant ?? 0),
    parrainage_semaines_min: Number(v.parrainage_semaines_min ?? 2),
    parrainage_posts_min_semaine: Number(v.parrainage_posts_min_semaine ?? 12),
    comment_master_par_commentaire: Number(v.comment_master_par_commentaire ?? 0),
    premier_lundi: String(v.premier_lundi ?? REGLAGES_BONUS_DEFAUT.premier_lundi),
  };
}
