import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/** Clé du prompt des comment masters dans la table `prompts` (cf. supabase/functions/_shared/comment_masters.ts). */
export const CLE_PROMPT_COMMENT_MASTER = "comment_master";

/** Variables que la fonction remplace à chaque post. */
export const VARIABLES_PROMPT = ["langue", "pays", "appli", "slides", "hashtags"] as const;

export interface ApercuCommentaire {
  lien: string;
  handle: string | null;
  langue: string;
  pays: string | null;
  appli: string;
  vues: number;
  accroche: string | null;
  commentaire: string;
  traduction: string;
  problemes: string[];
}

/**
 * Génère les commentaires de vrais posts déjà au-dessus du seuil de leur pays
 * (régions actives, ou la seule `langue` donnée), avec un prompt BROUILLON :
 * rien n'est enregistré ni envoyé sur Slack.
 */
export async function testerPromptCommentaires(
  prompt: string,
  langue: string | null = null,
  n = 6,
): Promise<ApercuCommentaire[]> {
  const r = await invoke<{ ok: boolean; apercu: ApercuCommentaire[] }>("comment-masters", {
    apercu: n,
    prompt,
    ...(langue ? { langue } : {}),
  });
  return r.apercu ?? [];
}

// ---------------------------------------------------------------------------
// Page Admin → Comment masters (migration 0321)
// ---------------------------------------------------------------------------

export interface RegionCommentMaster {
  langue: string;
  region: string;
  comment_master_id: string | null;
  comment_master: string | null;
  slack_channel_id: string | null;
  slack_verifie_canal: string | null;
  slack_verifie_at: string | null;
  slack_canal_nom: string | null;
  slack_erreur: string | null;
  slack_erreur_at: string | null;
  fenetre_heures: number;
  actif: boolean;
}

export type SourceSeuil = "initial" | "provisoire" | "manuel" | "auto";

export interface PaysCommentMaster {
  langue: string;
  pays: string;
  seuil_vues: number;
  verrou: boolean;
  seuil_source: SourceSeuil;
  seuil_maj_at: string | null;
  seuil_detail: { taux?: number; conclus?: number; declenches?: number } | null;
}

export interface MandatCommentMaster {
  id: string;
  langue: string;
  profile_id: string | null;
  nom: string;
  debut: string;
  fin: string | null;
}

export interface CandidatCommentMaster {
  langue: string;
  profile_id: string;
  prenom: string | null;
  nom: string | null;
  compte_id: string;
}

export interface StatsCommentMasters {
  debut: string;
  fin: string;
  faits: Array<{ langue: string; profile_id: string | null; nom: string; faits: number }>;
  regions: Array<{ langue: string; envoyes: number; faits: number; retrouves: number; likes: number }>;
  releves_7j: { lots: number; echecs: number; releves: number };
  commentaires_7j: number;
  pays_7j: Array<{
    langue: string;
    pays: string;
    suivis: number;
    conclus: number;
    declenches: number;
    abandonnes: number;
  }>;
}

export interface ConfigCommentMasters {
  regions: RegionCommentMaster[];
  pays: PaysCommentMaster[];
  mandats: MandatCommentMaster[];
}

export async function lireConfigCommentMasters(): Promise<ConfigCommentMasters> {
  const [regions, pays, mandats] = await Promise.all([
    supabase
      .from("comment_master_regions")
      .select(
        "langue, region, comment_master_id, comment_master, slack_channel_id, slack_verifie_canal, slack_verifie_at, slack_canal_nom, slack_erreur, slack_erreur_at, fenetre_heures, actif",
      ),
    supabase
      .from("comment_master_pays")
      .select("langue, pays, seuil_vues, verrou, seuil_source, seuil_maj_at, seuil_detail")
      .order("seuil_vues", { ascending: false }),
    supabase
      .from("comment_master_mandats")
      .select("id, langue, profile_id, nom, debut, fin")
      .order("debut", { ascending: false }),
  ]);
  if (regions.error) throw regions.error;
  if (pays.error) throw pays.error;
  if (mandats.error) throw mandats.error;
  return {
    regions: (regions.data ?? []) as RegionCommentMaster[],
    pays: (pays.data ?? []) as PaysCommentMaster[],
    mandats: (mandats.data ?? []) as MandatCommentMaster[],
  };
}

export async function listerCandidatsCommentMasters(): Promise<CandidatCommentMaster[]> {
  const { data, error } = await supabase.rpc("comment_masters_candidats");
  if (error) throw error;
  return (data ?? []) as CandidatCommentMaster[];
}

/** `mois` : le premier jour du mois, AAAA-MM-01 (bornes à l'heure de Paris côté SQL). */
export async function lireStatsCommentMasters(mois: string): Promise<StatsCommentMasters> {
  const { data, error } = await supabase.rpc("comment_masters_stats", { p_mois: mois });
  if (error) throw error;
  return data as StatsCommentMasters;
}

export interface DernierRecalibrage {
  jour: string;
  at: string;
  changements: Array<{ langue: string; pays: string; ancien: number; nouveau: number; taux: number }>;
  echantillon_insuffisant: number;
}

export async function lireDernierRecalibrage(): Promise<DernierRecalibrage | null> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "comment_masters_recalibrage")
    .maybeSingle();
  if (error) throw error;
  return (data?.valeur as DernierRecalibrage | undefined) ?? null;
}

/** Change le comment master ; la base ferme l'ancien mandat et ouvre le nouveau. */
export async function choisirCommentMaster(langue: string, profileId: string | null): Promise<void> {
  const { error } = await supabase
    .from("comment_master_regions")
    .update({ comment_master_id: profileId })
    .eq("langue", langue);
  if (error) throw error;
}

/** Enregistre l'ID du canal. Un canal changé n'est plus vérifié : la région s'éteint. */
export async function majCanalSlack(langue: string, canal: string): Promise<void> {
  const { error } = await supabase
    .from("comment_master_regions")
    .update({ slack_channel_id: canal.trim() || null })
    .eq("langue", langue);
  if (error) throw error;
}

/** Un seuil modifié à la main est verrouillé par la base (le recalibrage n'y touche plus). */
export async function majSeuilPays(langue: string, pays: string, seuil: number): Promise<void> {
  const { error } = await supabase
    .from("comment_master_pays")
    .update({ seuil_vues: seuil })
    .eq("langue", langue)
    .eq("pays", pays);
  if (error) throw error;
}

export async function majVerrouPays(langue: string, pays: string, verrou: boolean): Promise<void> {
  const { error } = await supabase
    .from("comment_master_pays")
    .update({ verrou })
    .eq("langue", langue)
    .eq("pays", pays);
  if (error) throw error;
}

export interface VerdictCanalSlack {
  ok: boolean;
  /** Code Slack ou de l'OS quand `ok` est faux (not_in_channel, channel_not_found…). */
  code?: string;
  canal?: string | null;
  /** Nom du bot des comment masters, à inviter dans le canal. */
  bot?: string | null;
  actif?: boolean;
}

/** Le bot est-il membre du canal ? Le verdict est aussi écrit sur la région. */
export async function verifierCanalSlack(langue: string): Promise<VerdictCanalSlack> {
  return await invoke<VerdictCanalSlack>("comment-masters", { action: "verifier_canal", langue });
}

/** Allume (après une vérification Slack faite par la fonction) ou éteint une région. */
export async function activerRegionCommentMaster(langue: string, actif: boolean): Promise<VerdictCanalSlack> {
  return await invoke<VerdictCanalSlack>("comment-masters", { action: "activer", langue, actif });
}
