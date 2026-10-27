/**
 * « Au moins 5 follows et 2 reposts » pendant le warm-up (0365). Les follows
 * viennent du dernier relevé TikTok ; les reposts, de la case que le posteur
 * coche (le scraper ne les voit pas, la HM vérifie dans l'onglet Reposts).
 */
import { supabase } from "@/lib/supabase/client";

import type { EtatWarmup } from "./logique";

export const FOLLOWS_MIN = 5;

export interface Exigences {
  ok: boolean;
  /** Follows au dernier relevé (null : compte TikTok pas lu). */
  follows: number | null;
  followsOk: boolean;
  repostsOk: boolean;
  /** Follows qui manquent pour atteindre 5. */
  followsManquants: number;
}

export function exigencesWarmup(e: Pick<EtatWarmup, "abonnements">, repostsAt: string | null | undefined): Exigences {
  const follows = e.abonnements;
  const followsOk = (follows ?? 0) >= FOLLOWS_MIN;
  const repostsOk = Boolean(repostsAt);
  return {
    ok: followsOk && repostsOk,
    follows,
    followsOk,
    repostsOk,
    followsManquants: Math.max(0, FOLLOWS_MIN - (follows ?? 0)),
  };
}

/** La case « J'ai fait 2 reposts » de chaque compte. */
export async function lireReposts(compteIds: string[]): Promise<Map<string, string | null>> {
  if (compteIds.length === 0) return new Map();
  const { data, error } = await supabase.from("comptes").select("id, warmup_reposts_at").in("id", compteIds);
  if (error) throw error;
  return new Map(
    (data ?? []).map((c) => [c.id as string, (c as { warmup_reposts_at: string | null }).warmup_reposts_at]),
  );
}

/** Cocher / décocher (le posteur, sa HM ou l'admin). */
export async function marquerReposts(compteId: string, fait: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc("warmup_reposts", { p_compte: compteId, p_fait: fait });
  if (error) throw error;
  return (data as string | null) ?? null;
}
