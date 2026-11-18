/**
 * Les règles natives de chaque langue (migration 0734) : les corrections
 * retenues des relecteurs, consolidées par Gemini en règles versionnées,
 * validées ici, puis lues par la traduction de production
 * (`corrections_natives_bloc`).
 */
import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export type StatutRegles = "proposee" | "validee" | "remplacee" | "rejetee";

export interface VersionRegles {
  id: string;
  langue: string;
  version: number;
  contenu: string;
  statut: StatutRegles;
  corrections_ids: string[];
  auteur: string | null;
  valide_le: string | null;
  created_at: string;
}

export interface BilanConsolidation {
  faites: Array<{ langue: string; version: number; nouvelles: number }>;
  sautees: Array<{ langue: string; raison: string }>;
  echecs: Array<{ langue: string; raison: string }>;
  restantes: string[];
}

/** Toutes les versions des règles d'une langue, la plus récente d'abord. */
export async function listerRegles(langue: string): Promise<VersionRegles[]> {
  const { data, error } = await supabase
    .from("regles_natives")
    .select("id, langue, version, contenu, statut, corrections_ids, auteur, valide_le, created_at")
    .eq("langue", langue.toLowerCase())
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VersionRegles[];
}

/**
 * Les ids des corrections DE LANGUE retenues (pour compter celles que les
 * règles validées ne couvrent pas). Une correction propre à une application
 * (0743) n'entre pas dans les règles : elle va au placement de son application.
 */
export async function idsCorrectionsRetenues(langue: string): Promise<string[]> {
  const lire = () =>
    supabase.from("corrections_natives").select("id").eq("langue", langue.toLowerCase()).eq("statut", "retenue").limit(5000);
  let { data, error } = await lire().is("application_id", null);
  // Avant 0743 : pas de colonne, toutes les retenues comptent comme avant.
  if (error && (error.code === "42703" || /application_id/.test(error.message ?? ""))) ({ data, error } = await lire());
  if (error) throw error;
  return (data ?? []).map((c) => String(c.id));
}

/** Lance la consolidation de la langue maintenant ; `remplacer` écrase la version en attente. */
export function consoliderRegles(langue: string, remplacer = false): Promise<BilanConsolidation & { ok: boolean }> {
  return invoke("ab-traduction", { action: "regles_consolider", langue, remplacer });
}

/** Valide une version proposée, avec le texte retouché s'il a changé. */
export async function validerRegles(id: string, contenu?: string): Promise<void> {
  const { error } = await supabase.rpc("regles_natives_valider", { p_id: id, p_contenu: contenu ?? null });
  if (error) throw error;
}

/** Rejette une version proposée : les règles validées restent celles d'avant. */
export async function rejeterRegles(id: string): Promise<void> {
  const { error } = await supabase.from("regles_natives").update({ statut: "rejetee" }).eq("id", id).eq("statut", "proposee");
  if (error) throw error;
}
