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
  /** L'id du contrat Upwork (0394) : sans lui, une relance par Upwork ne part pas. */
  contrat_id: string | null;
  /**
   * Prompt 21, C3 (0423) : « Ready » au dernier relevé avant le lundi de la
   * cohorte, par la seule définition de la base (`compte_pret`). Absent : pas lu.
   */
  pret?: boolean | null;
}

export async function lireRecrues(lundis: readonly string[]): Promise<RecrueCohorte[]> {
  if (lundis.length === 0) return [];
  const [{ data, error }, prets] = await Promise.all([
    supabase.rpc("cohorte_recrues", { p_lundis: [...lundis] }),
    // C3 : « Ready » vient de la base ; une erreur (migration pas encore là) garde l'ancien calcul.
    supabase.rpc("cohorte_prets", { p_lundis: [...lundis] }),
  ]);
  if (error) throw error;
  const pretDe = new Map(
    ((prets.error ? [] : prets.data ?? []) as { poster_id: string; pret: boolean }[]).map((p) => [p.poster_id, p.pret]),
  );
  return ((data ?? []) as RecrueCohorte[]).map((r) => ({
    pret: pretDe.get(r.poster_id) ?? null,
    ...r,
    semaine1: r.semaine1 ?? [],
    samedi: r.samedi ?? [],
    nudges: r.nudges ?? [],
    prevues: r.prevues ?? [],
    rouges: r.rouges ?? [],
    contrat_id: r.contrat_id ?? null,
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

/** « Link » : le lien du contrat Upwork, avec son id (0394). Rend l'id. */
export async function relierContrat(posterId: string, url: string): Promise<string> {
  const { data, error } = await supabase.rpc("cohorte_relier_contrat", { p_poster: posterId, p_url: url.trim() });
  if (error) throw error;
  return data as string;
}

/** Système du 2 nov., partie B (0402) : un Kill automatique (48 h sans réaction). */
export interface KillAuto {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  etape: "connexion" | "tiktok" | "warmup_lance" | "warmup_bien_fait";
  periode: string;
  message_at: string | null;
  detecte_at: string;
  /** Fin du délai d'annulation : l'arrêt complet part à ce moment. */
  prevu_at: string;
  statut: "simule" | "en_attente" | "annule" | "parti" | "erreur";
  raison: string | null;
  annule_at: string | null;
  parti_at: string | null;
  /** L'arrêt complet (partie C) : a_faire, en_cours, fait, erreur. */
  arret_statut: string | null;
  arret_erreur: string | null;
}

export async function lireKillsAuto(): Promise<KillAuto[]> {
  const { data, error } = await supabase.rpc("kills_auto_liste");
  if (error) throw error;
  return (data ?? []) as KillAuto[];
}

/** « Annuler » : tant que le délai court, rien ne part. */
export async function annulerKill(id: string): Promise<void> {
  const { error } = await supabase.rpc("kill_annuler", { p_id: id });
  if (error) throw error;
}

/** Système du 2 nov., partie C (0403) : une action d'un arrêt complet, journalisée. */
export interface EtapeArret {
  action: "os" | "message" | "jalons" | "remboursement" | "fermeture" | "slack" | "paie";
  statut: "fait" | "simule" | "erreur" | "a_faire" | "sans_objet";
  detail: string | null;
  at: string;
}

export interface Arret {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  source: "kill_48h" | "je_ne_veux_plus" | "kill_samedi" | "manuel";
  a_poste: boolean | null;
  statut: "a_faire" | "en_cours" | "fait" | "erreur";
  etapes: EtapeArret[];
  erreur: string | null;
  created_at: string;
  maj_at: string;
}

export async function lireArrets(): Promise<Arret[]> {
  const { data, error } = await supabase.rpc("arrets_liste");
  if (error) throw error;
  return ((data ?? []) as Arret[]).map((a) => ({ ...a, etapes: a.etapes ?? [] }));
}

/** Une action faite à la main (Slack retiré, remboursement demandé, contrat fermé). */
export async function marquerActionArret(id: string, action: "slack" | "remboursement" | "fermeture" | "message"): Promise<void> {
  const { error } = await supabase.rpc("arret_action_faite", { p_id: id, p_action: action });
  if (error) throw error;
}
