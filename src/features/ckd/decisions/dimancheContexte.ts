/**
 * 0496 : Weekly decisions → Sunday : tout le contexte de chaque recrue, les
 * lectures avec leur méthode, le Kill (au Validate), « Checked OK by hand ».
 * Règle des 2 méthodes : introuvable ou illisible par une seule méthode = « à
 * vérifier », jamais « at risk ».
 */
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import type { ChoixDebut } from "./checkWarmup";

export type StatutDimanche = "risque" | "a_verifier" | "ok" | "ok_main" | "report";
export type CodeKill = "stop" | "retrait" | "rien_fait" | "autre";
export type ChoixDimanche = ChoixDebut | "kill";

export interface LectureTiktok {
  at: string;
  methode: "page" | "apify" | "page+apify";
  existe: boolean | null;
  abonnements: number | null;
  videos: number | null;
  brut: string | null;
  handle: string | null;
}

export interface ContexteRecrue {
  /** 0501 : pour la section « Killed » (la recrue n'est plus dans la liste). */
  nom?: string | null;
  offre_acceptee_le: string | null;
  contrat_id: string | null;
  actif: boolean;
  welcome: { at: string | null; statut: string | null; par: "os" | "hm" | null } | null;
  connecte_at: string | null;
  slack: boolean;
  handle: string | null;
  start_warmup: string | null;
  abonnements: number | null;
  videos: number | null;
  relances: { n: number; derniere_at: string | null; canal: string | null } | null;
  /** 0499 : les relances parties (8 dernières) et celles encore prévues. */
  relances_envoyees?: { at: string; canal: string; type: string }[];
  relances_prevues?: { at: string; canal: string | null; etape: string | null }[];
  recu: { at: string; texte: string; canal: "upwork" | "slack" } | null;
  envoye: { at: string; texte: string; canal: string } | null;
  jalon: { nom: string | null; depot: string | null; etat: string | null } | null;
  retrait: { source: string; texte: string; at: string | null } | null;
  verif_main: { at: string; note: string | null } | null;
  kill: { code: CodeKill; detail: string | null; at: string; montant: number | null } | null;
  lectures: LectureTiktok[];
}

export interface LigneContexte {
  poster_id: string;
  statut: StatutDimanche;
  ctx: ContexteRecrue;
}

export async function lireContexteDimanche(lundi: string): Promise<Map<string, LigneContexte>> {
  const { data, error } = await supabase.rpc("warmup_check_contexte", { p_lundi: lundi });
  if (error) throw error;
  return new Map(((data ?? []) as LigneContexte[]).map((l) => [l.poster_id, l]));
}

/** Kill d'une recrue qui n'a jamais posté : arrêt dans l'OS, « To remove from Slack », file des fins de contrat. */
export async function tuerRecrue(posterId: string, lundi: string, code: CodeKill, detail: string): Promise<void> {
  const { error } = await supabase.rpc("dimanche_kill", { p_poster: posterId, p_lundi: lundi, p_code: code, p_detail: detail || null });
  if (error) throw error;
}

/** Après les Kills : la file des arrêts tout de suite (fermeture du contrat selon arret_auto ; Test : simulée). */
export async function lancerArrets(): Promise<void> {
  await invoke("upwork", { action: "arrets" });
}

export async function verifierALaMain(posterId: string, lundi: string, annuler = false): Promise<void> {
  const { error } = await supabase.rpc("warmup_ok_main", { p_poster: posterId, p_lundi: lundi, p_note: null, p_annuler: annuler });
  if (error) throw error;
}

/** La raison pré-remplie d'une recrue qui s'est retirée : STOP, sinon « se retire ». */
export function codeRetrait(r: ContexteRecrue["retrait"]): CodeKill | null {
  if (!r) return null;
  return /^\s*stop\s*$/i.test(r.texte) ? "stop" : "retrait";
}
