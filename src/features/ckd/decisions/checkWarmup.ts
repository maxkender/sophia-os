/**
 * 0474 : le check du warm-up du dimanche soir (Weekly decisions → Sunday).
 * Les recrues de la cohorte du lendemain, à risque d'abord ; « Warm-up OK »
 * (elle commence lundi) ou « Not warmed up » (posts mardi + message). Rien ne
 * part sans clic.
 */
import { invoke } from "@/features/moteur/api";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { supabase } from "@/lib/supabase/client";

import { lundiDeLaSemaine } from "./logique";

export type RisqueWarmup = "jamais_releve" | "introuvable" | "illisible" | "moins_5" | "posts";

export interface LigneWarmup {
  poster_id: string;
  nom: string | null;
  hm_nom: string | null;
  slack: boolean;
  contrat_id: string | null;
  compte_id: string | null;
  handle: string | null;
  pays: string | null;
  warmup_started_at: string | null;
  releve_at: string | null;
  existe: boolean | null;
  abonnements: number | null;
  videos: number | null;
  erreur_releve: string | null;
  releves: { at: string; existe: boolean | null; abonnements: number | null; videos: number | null; erreur: string | null }[];
  risques: RisqueWarmup[];
  /** risque : en haut ; ok : replié en bas ; report : pas de compte ou pas de Start warmup (report d'une semaine). */
  groupe: "risque" | "ok" | "report";
  decision: "ok" | "pas_chaud" | null;
  decide_at: string | null;
  message_statut: string | null;
  message_erreur: string | null;
}

/** Le lundi de la cohorte à vérifier : le lundi qui vient (le lundi lui-même : ce lundi). */
export function prochainLundi(aujourdhui: string): string {
  const lundi = lundiDeLaSemaine(aujourdhui);
  return lundi === aujourdhui ? lundi : ajouterJours(lundi, 7);
}

export async function lireCheckWarmup(lundi: string): Promise<LigneWarmup[]> {
  const { data, error } = await supabase.rpc("warmup_check_liste", { p_lundi: lundi });
  if (error) throw error;
  return (data ?? []) as LigneWarmup[];
}

export async function deciderWarmup(posterId: string, lundi: string, decision: "ok" | "pas_chaud"): Promise<{ canal?: string }> {
  const r = await invoke<{ ok: boolean; error?: string; canal?: string }>("upwork", {
    action: "warmup_check_decider", poster_id: posterId, lundi, decision, confirmer: true,
  });
  if (!r.ok) throw new Error(r.error ?? "décision refusée");
  return r;
}

export function lienTiktok(handle: string | null): string | null {
  const h = (handle ?? "").replace(/^@/, "").trim();
  return h ? `https://www.tiktok.com/@${h}` : null;
}
