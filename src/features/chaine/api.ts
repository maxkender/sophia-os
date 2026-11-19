/**
 * La chaîne de traduction et de placement, vue par langue (page Admin →
 * Traduction & placement) : quels prompts existent et depuis quand, combien
 * de comptes actifs et de relecteurs natifs par langue. Lectures légères, à
 * côté de `lirePrompt` / `ecrirePrompt` (moteur/api.ts) qui portent l'édition.
 */
import { supabase } from "@/lib/supabase/client";

import type { RetourApplication } from "./retoursApplication";

export interface PromptMeta {
  cle: string;
  updated_at: string;
  longueur: number;
}

/** Clé, date et longueur de chaque prompt dont la clé commence par `prefixe`. */
export async function listerPromptsMeta(prefixe: string): Promise<PromptMeta[]> {
  const { data, error } = await supabase
    .from("prompts")
    .select("cle, updated_at, contenu")
    .like("cle", `${prefixe}%`)
    .order("cle");
  if (error) throw error;
  return ((data ?? []) as Array<{ cle: string; updated_at: string; contenu: string | null }>).map((p) => ({
    cle: p.cle,
    updated_at: p.updated_at,
    longueur: (p.contenu ?? "").length,
  }));
}

/** Comptes posteurs actifs par langue (code en minuscules). */
export async function compterComptesParLangue(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("comptes").select("langue").eq("is_active", true);
  if (error) throw error;
  const n: Record<string, number> = {};
  for (const c of (data ?? []) as Array<{ langue: string | null }>) {
    const l = (c.langue ?? "").toLowerCase();
    if (l) n[l] = (n[l] ?? 0) + 1;
  }
  return n;
}

/** Relecteurs natifs invités ou actifs par langue (code en minuscules). */
export async function compterRelecteursParLangue(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("relecteurs_natifs").select("langue").in("statut", ["invite", "actif"]);
  if (error) throw error;
  const n: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ langue: string | null }>) {
    const l = (r.langue ?? "").toLowerCase();
    if (l) n[l] = (n[l] ?? 0) + 1;
  }
  return n;
}

/** Les corrections natives d'une langue, comptées par destination (0630, 0751). */
export interface CompteCorrections {
  /** Retenues, de langue : dans la traduction de toutes les applications. */
  deLangue: number;
  /** Retenues, propres à une application : au placement de cette application. */
  dAppli: number;
  /** Proposées : rien n'entre dans un prompt tant qu'elles ne sont pas triées. */
  aTrier: number;
}

export async function compterCorrectionsLangue(langue: string): Promise<CompteCorrections> {
  const compter = () =>
    supabase.from("corrections_natives").select("id", { count: "exact", head: true }).eq("langue", langue.toLowerCase());
  const [deLangue, dAppli, aTrier] = await Promise.all([
    compter().eq("statut", "retenue").is("application_id", null),
    compter().eq("statut", "retenue").not("application_id", "is", null),
    compter().eq("statut", "proposee"),
  ]);
  const erreur = deLangue.error ?? dAppli.error ?? aTrier.error;
  if (erreur) throw erreur;
  return { deLangue: deLangue.count ?? 0, dAppli: dAppli.count ?? 0, aTrier: aTrier.count ?? 0 };
}

/**
 * La clé de requête des retours propres à une application, sous
 * « corrections-natives » : retenir, écarter ou ranger une correction relit
 * les blocs.
 */
export function cleRetoursApplications(filtre: { langue?: string; applicationId?: string }) {
  return ["corrections-natives", "retours-applications", filtre.langue?.toLowerCase() ?? null, filtre.applicationId ?? null] as const;
}

/**
 * Les corrections retenues rangées sous une application (0751), les plus
 * récentes d'abord : celles d'une langue (toutes ses applications), ou celles
 * d'une application (toutes ses langues).
 */
export async function listerRetoursApplications(filtre: { langue?: string; applicationId?: string }): Promise<RetourApplication[]> {
  let requete = supabase
    .from("corrections_natives")
    .select("langue, application_id, fautif, corrige, explication, created_at")
    .eq("statut", "retenue")
    .not("application_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filtre.langue) requete = requete.eq("langue", filtre.langue.toLowerCase());
  if (filtre.applicationId) requete = requete.eq("application_id", filtre.applicationId);
  const { data, error } = await requete;
  if (error) throw error;
  return (data ?? []) as RetourApplication[];
}
