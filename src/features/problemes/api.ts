import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Bloc C (2/11) : la page « Problèmes » (remplace Needs you). Tout vient de
 * problemes_liste() (0517) ; les gestes passent par probleme_agir(). Rien
 * n'est envoyé en mode test ; l'argent n'est jamais exécuté ici.
 */
export type Niveau = "urgent" | "aujourdhui" | "samedi";
export type Proprietaire = "new_cohort_bot" | "control_bot" | "pay_bot";
export type StatutProbleme = "ouvert" | "valide" | "ignore" | "ferme_auto";

export interface SourceProbleme {
  type: string;
  ref: string;
  at?: string;
  texte?: string;
  lien?: string;
  canal?: string;
  par?: string;
}

export interface Probleme {
  id: string;
  poster_id: string | null;
  contrat_id: string | null;
  nom: string | null;
  hm: string | null;
  cohorte: string | null;
  actif: boolean | null;
  categorie: string;
  niveau: Niveau;
  resume: string;
  sources: SourceProbleme[];
  proprietaire: Proprietaire;
  proposition_reponse: string | null;
  canal_reponse: "upwork" | "slack" | null;
  proposition_action: string | null;
  propose_par: string | null;
  propose_at: string | null;
  statut: StatutProbleme;
  ferme_raison: string | null;
  ferme_at: string | null;
  created_at: string;
  maj_at: string;
  slack_relie: boolean;
  compte_id: string | null;
}

export interface Archive {
  type: string;
  ref: string;
  poster_id: string | null;
  nom: string | null;
  texte: string | null;
  recu_at: string | null;
  raison: string | null;
}

export interface CompteProblemes {
  urgent: number;
  aujourdhui: number;
  samedi: number;
  total: number;
}

export async function lireProblemes(vue: "ouverts" | "fermes" = "ouverts"): Promise<Probleme[]> {
  const { data, error } = await supabase.rpc("problemes_liste", { p_vue: vue });
  if (error) throw error;
  return (data ?? []) as Probleme[];
}

export async function lireArchives(): Promise<Archive[]> {
  const { data, error } = await supabase.rpc("problemes_archives_liste", { p_limite: 200 });
  if (error) throw error;
  return (data ?? []) as Archive[];
}

export async function lireCompteProblemes(): Promise<CompteProblemes> {
  const { data, error } = await supabase.rpc("problemes_compte");
  if (error) throw error;
  return (data ?? { urgent: 0, aujourdhui: 0, samedi: 0, total: 0 }) as CompteProblemes;
}

export type ModeProblemes = "test" | "on";

/** Le mode de la page (0517 : « test » par défaut ; rien n'est envoyé tant qu'il n'est pas « on »). */
export async function lireModeProblemes(): Promise<ModeProblemes> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "problemes_mode").maybeSingle();
  if (error) throw error;
  return data?.valeur === "on" ? "on" : "test";
}

export async function agirProbleme(id: string, action: "modifier" | "samedi" | "ignorer" | "valider", valeur?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc("probleme_agir", { p_id: id, p_action: action, p_valeur: valeur ?? null });
  if (error) throw error;
}

export async function validerCategorie(niveau: Niveau, categorie: string): Promise<number> {
  const { data, error } = await supabase.rpc("problemes_valider_categorie", { p_niveau: niveau, p_categorie: categorie });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Relancer le collecteur tout de suite (sinon toutes les 30 min). */
export async function passerMaintenant(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("problemes_passage");
  if (error) throw error;
  return (data ?? {}) as Record<string, number>;
}

/** Mode « on » seulement : la réponse part sur Upwork (quota du compte géré par l'envoi). */
export async function envoyerUpwork(posterId: string, texte: string): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("upwork", { action: "message_posteur", poster_id: posterId, texte, type: "probleme" });
  if (!r.ok) throw new Error(r.error ?? "envoi Upwork impossible");
}

/** Une réponse par conversation et par jour : déjà écrit aujourd'hui depuis cette page ? */
export async function dejaEcritAujourdhui(posterId: string, depuis: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("nudges")
    .select("id", { count: "exact", head: true })
    .eq("poster_id", posterId)
    .eq("type", "probleme_upwork")
    .gte("envoye_at", depuis);
  if (error) throw error;
  return (count ?? 0) > 0;
}
