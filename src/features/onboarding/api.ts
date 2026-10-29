import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 25 v4 (0441) : Onboarding posters. Une carte par recrue (le 1er
 * compte), chaque étape avec sa date, tous les messages envoyés, la prochaine
 * relance prévue.
 */
export interface MessageOnboarding {
  id: string;
  type: string;
  at: string;
  canal: string | null;
  canaux: string[] | null;
  texte: string | null;
  statut: "envoye" | "erreur";
  erreur: string | null;
  reponse: { at: string; canal: string; texte: string | null } | null;
  /** Prompt 25 MAJ (0446) : pourquoi il est parti (les données utilisées), et qui l'a envoyé. */
  raison?: string | null;
  expediteur?: string | null;
  /** Prompt 25 MAJ, point 8 (0448) : la HM qui l'a envoyé, et la vérification sur Upwork. */
  hm_nom?: string | null;
  verif?: "verifie" | "sent_introuvable" | null;
}

export interface RecrueOnboarding {
  poster_id: string;
  nom: string | null;
  hm_id: string | null;
  hm_nom: string | null;
  pays: string | null;
  cohorte_lundi: string;
  contrat_id: string | null;
  contrat_url: string | null;
  email: string | null;
  slack: boolean;
  handle: string | null;
  bienvenue_at: string | null;
  connexion_at: string | null;
  tiktok_at: string | null;
  warmup_at: string | null;
  pret: boolean;
  pret_at: string | null;
  abonnements: number | null;
  repondu_at: string | null;
  messages: MessageOnboarding[];
  prochaine: { type: string; periode: string; canal: string | null; texte: string | null; raison: string | null; valide: boolean } | null;
  test: boolean;
}

export async function lireOnboarding(): Promise<RecrueOnboarding[]> {
  const { data, error } = await supabase.rpc("onboarding_posteurs");
  if (error) throw error;
  return (data ?? []) as RecrueOnboarding[];
}

/** Posters : ceux qui ont publié au moins un post avec lien (les autres sont sur Onboarding posters). */
export async function lirePosteursAyantPoste(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("posteurs_ayant_poste");
  if (error) throw error;
  return new Set(((data ?? []) as string[]).map(String));
}

/** Les étapes, dans l'ordre : 0 Slack, 1 login, 2 TikTok, 3 warm-up lancé, 4 warm-up fait. */
export const ETAPES_ONBOARDING = ["slack", "connexion", "tiktok", "warmup", "pret"] as const;
export type EtapeOnboarding = (typeof ETAPES_ONBOARDING)[number];

/** Chaque étape : faite ou pas, et sa date (Slack : pas de date connue). */
export function etapesRecrue(r: RecrueOnboarding): { etape: EtapeOnboarding; fait: boolean; at: string | null }[] {
  return [
    { etape: "slack", fait: r.slack, at: null },
    { etape: "connexion", fait: Boolean(r.connexion_at), at: r.connexion_at },
    { etape: "tiktok", fait: Boolean(r.tiktok_at), at: r.tiktok_at },
    { etape: "warmup", fait: Boolean(r.warmup_at), at: r.warmup_at },
    { etape: "pret", fait: r.pret, at: r.pret_at },
  ];
}

/** La 1re étape pas faite (« fini » : tout est fait). */
export function etapeCourante(r: RecrueOnboarding): EtapeOnboarding | "fini" {
  return etapesRecrue(r).find((e) => !e.fait)?.etape ?? "fini";
}

export interface FiltresOnboarding {
  hm: string;
  cohorte: string;
  etape: string;
}

export function filtrerOnboarding(liste: readonly RecrueOnboarding[], f: FiltresOnboarding): RecrueOnboarding[] {
  return liste
    .filter((r) => (!f.hm || (r.hm_id ?? "") === f.hm) && (!f.cohorte || r.cohorte_lundi === f.cohorte) && (!f.etape || etapeCourante(r) === f.etape))
    .sort((a, b) => a.cohorte_lundi.localeCompare(b.cohorte_lundi) || (a.nom ?? "").localeCompare(b.nom ?? ""));
}
