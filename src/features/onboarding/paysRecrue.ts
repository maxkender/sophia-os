import { supabase } from "@/lib/supabase/client";

/**
 * 31/10 (0482) : le pays de chaque nouvelle recrue, vérifié. Les annonces
 * passent à une par zone et par semaine : on compare le pays choisi par la HM
 * (compte), où vit le freelance (API Upwork) et l'annonce (zone ou pays).
 */
export type VerdictPays = "ok" | "en_lecture" | "a_verifier" | "confirme";

export interface PaysRecrue {
  poster_id: string;
  contrat_id: string | null;
  pays_hm: string | null;
  zone_hm: string | null;
  pays_vit: string | null;
  ville: string | null;
  lu: boolean;
  annonce_titre: string | null;
  annonce_zone: string | null;
  annonce_pays: string | null;
  verdict: VerdictPays;
  raisons: string[];
  confirme_pays: string | null;
  confirme_par_nom: string | null;
  confirme_at: string | null;
}

export async function lirePaysRecrues(): Promise<Map<string, PaysRecrue>> {
  const { data, error } = await supabase.rpc("onboarding_pays");
  if (error) throw error;
  return new Map(((data ?? []) as PaysRecrue[]).map((p) => [p.poster_id, p]));
}

/** « Country is right » : le pays du compte est confirmé (tant qu'il ne change pas). */
export async function confirmerPays(posterId: string): Promise<void> {
  const { error } = await supabase.rpc("pays_confirmer", { p_poster: posterId });
  if (error) throw error;
}

export const aVerifier = (p: PaysRecrue | undefined) => p?.verdict === "a_verifier";
