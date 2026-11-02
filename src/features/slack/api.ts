import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/** Un posteur actif sans compte Slack (0381) : tous pour l'admin, les siens pour une HM. */
export interface PosteurARelier {
  id: string;
  nom: string | null;
  email_perso: string | null;
  email: string | null;
  hm_id: string | null;
  hm_prenom: string | null;
  created_at: string;
}

/** Un membre du workspace sophia-system encore libre. L'email n'est rendu qu'à l'admin. */
export interface MembreLibre {
  slack_user_id: string;
  nom_reel: string | null;
  nom_affiche: string | null;
  email: string | null;
}

export interface ResultatSynchroSlack {
  membres: number;
  posteurs: number;
  deja_relies: number;
  par_email: number;
  par_nom: number;
  poses: number;
  ambigus: number;
  restants: number;
}

export interface EtatSlack {
  relies: number;
  a_relier: number;
  derniere_synchro: { at: string; source: string; simulation: boolean; resultat: ResultatSynchroSlack } | null;
}

export async function lirePosteursARelier(): Promise<PosteurARelier[]> {
  const { data, error } = await supabase.rpc("slack_a_relier");
  if (error) throw error;
  return (data ?? []) as PosteurARelier[];
}

export async function lireMembresLibres(): Promise<MembreLibre[]> {
  const { data, error } = await supabase.rpc("slack_membres_libres");
  if (error) throw error;
  return (data ?? []) as MembreLibre[];
}

export async function lireEtatSlack(): Promise<EtatSlack> {
  const { data, error } = await supabase.rpc("slack_etat");
  if (error) throw error;
  return data as EtatSlack;
}

export async function relierSlack(profileId: string, slackUserId: string | null): Promise<void> {
  const { error } = await supabase.rpc("slack_relier", { p_profile: profileId, p_slack: slackUserId });
  if (error) throw error;
}

/** Relit le workspace et pose les liens sûrs (admin, Head of Ops). */
export async function synchroniserSlackPosteurs(simuler = false): Promise<ResultatSynchroSlack> {
  return await invoke<ResultatSynchroSlack>("slack-relier", { action: "synchro", simuler });
}

/** 0497 : « I've joined » / « I did this step » envoyés par les recrues, à confirmer. */
export interface DeclarationEtape {
  poster_id: string;
  nom: string | null;
  cohorte_lundi: string | null;
  etape: "slack" | "tiktok" | "warmup";
  note: string | null;
  declare_at: string;
  statut: string;
  candidats: { slack_user_id: string; nom: string | null; vu: string | null }[] | null;
}

export async function lireDeclarationsEtapes(): Promise<DeclarationEtape[]> {
  const { data, error } = await supabase.rpc("etape_declarations_liste");
  if (error) throw error;
  return (data ?? []) as DeclarationEtape[];
}

export async function deciderDeclaration(posterId: string, etape: string, valide: boolean, slack?: string | null): Promise<void> {
  const { error } = await supabase.rpc("etape_declaration_decider", {
    p_poster: posterId,
    p_etape: etape,
    p_valide: valide,
    p_slack: slack ?? null,
  });
  if (error) throw error;
}
