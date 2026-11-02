import { supabase } from "@/lib/supabase/client";

/**
 * Recruitment Automation → Cohorts (0445) : les données des tableaux de bord,
 * en lecture seule. Une ligne par posteur, dans la cohorte où il commence
 * vraiment ; la médiane des vues par cohorte, semaine et HM.
 */

/** Une semaine de cohorte (S1 = la semaine du lundi de départ), tous les comptes du posteur. */
export interface SemainePosteur {
  k: number;
  /** Comptes qui avaient des posts prévus cette semaine. */
  comptes: number;
  prevus: number;
  /** Posts avec lien. */
  liens: number;
  /** Comptes à 6 posts avec lien ou plus. */
  comptes6: number;
}

export interface PosteurCohorte {
  poster_id: string;
  nom: string | null;
  hm_id: string | null;
  hm_nom: string | null;
  pays: string | null;
  cohorte_lundi: string;
  /** La cohorte d'où il a été reporté (null : pas reporté). */
  reporte_de: string | null;
  actif: boolean;
  offre_at: string | null;
  bienvenue_at: string | null;
  connexion_at: string | null;
  slack_at: string | null;
  sur_slack: boolean;
  tiktok_at: string | null;
  warmup_at: string | null;
  /** « Ready » (warm-up bien fait), seulement pour une cohorte pas commencée. */
  pret: boolean | null;
  relances_slack: number;
  relances_upwork: number;
  main_hm: number;
  en_file: number;
  derniere_reaction: string | null;
  kill_at: string | null;
  kill_raison: string | null;
  arret_at: string | null;
  arret_raison: string | null;
  double_at: string | null;
  premier_post: string | null;
  semaines: SemainePosteur[];
}

export interface VuesCohorte {
  cohorte_lundi: string;
  niveau: "cohorte" | "semaine" | "hm" | "hm_semaine";
  hm_id: string | null;
  k: number | null;
  posts: number;
  mediane: number | null;
}

export interface DonneesCohortes {
  postes: PosteurCohorte[];
  vues: VuesCohorte[];
  /** L'heure de la lecture (affichée en haut). */
  lu_at: string;
}

export async function lireCohortes(): Promise<DonneesCohortes> {
  const [postes, vues] = await Promise.all([supabase.rpc("cohortes_postes", { p_lundi: null }), supabase.rpc("cohortes_vues", { p_lundi: null })]);
  if (postes.error) throw postes.error;
  if (vues.error) throw vues.error;
  return {
    postes: (postes.data ?? []) as PosteurCohorte[],
    vues: ((vues.data ?? []) as VuesCohorte[]).map((v) => ({ ...v, mediane: v.mediane === null ? null : Number(v.mediane) })),
    lu_at: new Date().toISOString(),
  };
}
