import { supabase } from "@/lib/supabase/client";

import type { Filleul, StatutFilleul } from "./BlocParrainer";
import type { LignePaysParrainage } from "./PaysParrainage";

export interface MonParrainage {
  actif: boolean;
  ce_mois: number;
  pays: { code: string; ouvert: boolean }[];
  filleuls: (Omit<Filleul, "statut"> & { statut: StatutFilleul })[];
}

export async function lireMonParrainage(): Promise<MonParrainage> {
  const { data, error } = await supabase.rpc("mon_parrainage");
  if (error) throw error;
  return data as MonParrainage;
}

export async function inviterAmi(f: { email: string; prenom: string; pays: string }): Promise<{ attente: boolean }> {
  const { data, error } = await supabase.rpc("parrainage_inviter", { p_email: f.email, p_prenom: f.prenom, p_pays: f.pays, p_accord: true });
  if (error) throw new Error(error.message);
  return { attente: Boolean((data as { attente?: boolean } | null)?.attente) };
}

export async function lirePaysParrainage(): Promise<Omit<LignePaysParrainage, "nom" | "langue">[]> {
  const { data, error } = await supabase.rpc("parrainage_pays_liste");
  if (error) throw error;
  return (data ?? []) as Omit<LignePaysParrainage, "nom" | "langue">[];
}

export async function changerPaysParrainage(pays: string, champ: "envoi_auto" | "recrutement_ouvert", valeur: boolean): Promise<void> {
  const { error } = await supabase.rpc("parrainage_pays_changer", { p_pays: pays, p_champ: champ, p_valeur: valeur });
  if (error) throw error;
}

export interface SuiviParrainage {
  lignes: {
    pays: string; semaine: string; invites: number; emails: number; ouverts: number; cliques: number;
    candidatures: number; actifs: number; bonus_payes: number; cout: number; cout_par_recrue: number | null;
  }[];
  top: { parrain: string; invites: number; actifs: number }[];
}

export async function lireSuiviParrainage(): Promise<SuiviParrainage> {
  const { data, error } = await supabase.rpc("parrainage_suivi");
  if (error) throw error;
  return data as SuiviParrainage;
}

/** « Greece », « Germany » : le nom anglais d'un pays (posteur) ; « Grèce » en français (admin). */
export function nomPays(code: string, langue: "en" | "fr" = "en"): string {
  try {
    return new Intl.DisplayNames([langue], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
