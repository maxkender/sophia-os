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
  /**
   * risque : en haut (moins de 5 abonnements, un post, ou introuvable par les 2 méthodes) ;
   * illisible : pas lu par les 2 méthodes ; ok : replié ; report : pas de compte ou pas de Start warmup.
   */
  groupe: "risque" | "illisible" | "ok" | "report";
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

/** 1/11 : Keep (lundi), Start Tuesday (posts à partir de mardi), Postpone (lundi suivant). */
export type ChoixDebut = "keep" | "mardi" | "reporter";

export interface ChoixDebutLigne {
  poster_id: string;
  choix: ChoixDebut;
  source: "manuel" | "auto_dimanche" | "auto_lundi";
  decide_at: string;
  texte: string | null;
  message_canal: string | null;
  message_statut: string | null;
  message_erreur: string | null;
}

export async function lireChoixDebut(lundi: string): Promise<Map<string, ChoixDebutLigne>> {
  const { data, error } = await supabase.rpc("debut_choix_liste", { p_lundi: lundi });
  if (error) throw error;
  return new Map(((data ?? []) as ChoixDebutLigne[]).map((c) => [c.poster_id, c]));
}

export async function choisirDebut(posterId: string, lundi: string, choix: ChoixDebut): Promise<{ canal?: string | null; statut?: string | null }> {
  const r = await invoke<{ ok: boolean; error?: string; erreur?: string | null; canal?: string | null; statut?: string | null }>("recrues-check", {
    action: "debut_choisir", poster_id: posterId, lundi, choix,
  });
  if (!r.ok) throw new Error(r.error ?? r.erreur ?? "choix refusé");
  return r;
}

/**
 * Le choix d'une recrue : celui noté (clic ou auto), sinon l'ancienne décision
 * (Warm-up OK → Keep, Not warmed up → Start Tuesday), sinon ce que l'OS fera :
 * prête → Keep ; pas prête → Start Tuesday à 22:45.
 */
export function choixDe(l: Pick<LigneWarmup, "groupe" | "decision">, c: ChoixDebutLigne | undefined): { choix: ChoixDebut; prevu: boolean } {
  if (c) return { choix: c.choix, prevu: false };
  if (l.decision) return { choix: l.decision === "ok" ? "keep" : "mardi", prevu: false };
  return { choix: l.groupe === "ok" ? "keep" : "mardi", prevu: true };
}
