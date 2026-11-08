import { supabase } from "@/lib/supabase/client";

/** 0567 : un passage du banc d'essai des bots. */
export interface PassageBanc {
  id: string;
  lance_at: string;
  declencheur: string;
  statut: "en_cours" | "fait" | "erreur";
  n: number | null;
  justes: number | null;
  score: number | null;
  erreur: string | null;
  details: { cle: string; source: string; situation: string; attendu: string; obtenu: string | null; ok: boolean }[];
}

export async function lireBanc(): Promise<{ passages: PassageBanc[]; exemples: Record<string, number> | null }> {
  const { data, error } = await supabase.rpc("bots_banc_lire");
  if (error) throw new Error(error.message);
  return data as { passages: PassageBanc[]; exemples: Record<string, number> | null };
}

export async function lancerBanc(): Promise<{ ok: boolean; n?: number; justes?: number; score?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("bots-banc", { body: { action: "lancer" } });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; n?: number; justes?: number; score?: number; error?: string };
}

export const SOURCES_EXEMPLES: Record<string, string> = {
  depart: "départ",
  modifier: "Modifier",
  ignorer: "Ignorer",
  autre_choix: "autre choix",
  annulation: "annulation",
  weekly: "Weekly",
  manuel: "à la main",
};

/** 0.833 → « 83 % ». */
export function pourcent(score: number | null): string {
  return score === null ? "—" : `${Math.round(Number(score) * 100)} %`;
}
