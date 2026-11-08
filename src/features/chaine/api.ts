/**
 * La chaîne de traduction et de placement, vue par langue (page Admin →
 * Traduction & placement) : quels prompts existent et depuis quand, combien
 * de comptes actifs et de relecteurs natifs par langue. Lectures légères, à
 * côté de `lirePrompt` / `ecrirePrompt` (moteur/api.ts) qui portent l'édition.
 */
import { supabase } from "@/lib/supabase/client";

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
