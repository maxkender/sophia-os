import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Pipeline (0407) : toutes les recrues, de l'offre acceptée au 1er jour de
 * posts. Une carte par recrue, et une par 2e compte (Double).
 */
export type EtatCarte = "attente" | "relance" | "repondu" | "kill" | "fait";

export interface CartePipeline {
  carte_id: string;
  poster_id: string;
  compte_id: string | null;
  nom: string | null;
  pays: string | null;
  hm_id: string | null;
  hm_prenom: string | null;
  cohorte_lundi: string;
  deuxieme: boolean;
  handle: string | null;
  /** 1 offre acceptée · 2 connecté · 3 compte TikTok · 4 warm-up lancé · 5 prêt · 6 1er jour posté. */
  colonne: number;
  colonne_depuis: string | null;
  etape_attendue: string | null;
  etat: EtatCarte;
  message_at: string | null;
  message_canal: string | null;
  /** Prévu en test (rien n'est parti). */
  message_test: boolean;
  /** Le Kill tombe si rien ne bouge avant cette heure (message + 48 h). */
  limite_at: string | null;
  reponse_at: string | null;
  reponse_extrait: string | null;
  kill_id: string | null;
  kill_prevu_at: string | null;
  pause_jusqu_au: string | null;
  upwork_contrat_url: string | null;
  slack_user_id: string | null;
  dernier_type: string | null;
  dernier_at: string | null;
}

export interface ArretePipeline {
  poster_id: string;
  nom: string | null;
  pays: string | null;
  hm_prenom: string | null;
  source: string;
  arrete_at: string;
  statut: string;
}

export interface EvenementRecrue {
  type: string;
  at: string;
  detail: string | null;
  compte_id: string | null;
  handle: string | null;
}

export async function lirePipeline(): Promise<CartePipeline[]> {
  const { data, error } = await supabase.rpc("pipeline_recrues");
  if (error) throw error;
  return (data ?? []) as CartePipeline[];
}

export async function lireArretes(): Promise<ArretePipeline[]> {
  const { data, error } = await supabase.rpc("pipeline_arretes");
  if (error) throw error;
  return (data ?? []) as ArretePipeline[];
}

export async function lireHistorique(posterId: string): Promise<EvenementRecrue[]> {
  const { data, error } = await supabase.rpc("pipeline_historique", { p_poster: posterId });
  if (error) throw error;
  return (data ?? []) as EvenementRecrue[];
}

/** Le dernier texte de relance (envoyée ou prévue) du posteur : pour « Send on Upwork ». */
export async function dernierTexteRelance(posterId: string): Promise<string> {
  const [{ data: n }, { data: v }] = await Promise.all([
    supabase.from("nudges").select("texte, envoye_at").eq("poster_id", posterId).order("envoye_at", { ascending: false }).limit(1),
    supabase.from("relances_prevues").select("texte, maj_at").eq("poster_id", posterId).not("texte", "is", null)
      .order("maj_at", { ascending: false }).limit(1),
  ]);
  const a = n?.[0];
  const b = v?.[0];
  if (a && b) return (Date.parse(a.envoye_at) >= Date.parse(b.maj_at) ? a.texte : b.texte) ?? "";
  return (a?.texte ?? b?.texte ?? "") as string;
}

/** « Send on Upwork » : le texte dans la conversation du contrat, noté comme relance. */
export async function envoyerSurUpwork(posterId: string, texte: string, type?: string | null): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("upwork", { action: "message_posteur", poster_id: posterId, texte, type });
  if (!r.ok) throw new Error(r.error ?? "message non envoyé");
}

/** « Arrêter » : la file des arrêts complets (partie C). */
export async function arreterDepuisPipeline(posterId: string): Promise<void> {
  const { error } = await supabase.rpc("pipeline_arreter", { p_poster: posterId });
  if (error) throw error;
}
