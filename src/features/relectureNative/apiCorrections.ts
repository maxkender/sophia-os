/**
 * La boucle de correction (0630) : les remarques des relecteurs natifs
 * découpées en corrections atomiques (`corrections_natives`), retenues ou
 * écartées par l'admin. Les retenues entrent dans la traduction de la langue
 * (bloc `corrections_natives_bloc`) et, pour le type placement, dans les
 * exemples du placement. Écriture admin (RLS).
 */
import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export const TYPES_CORRECTION = ["calque", "registre", "vocabulaire", "placement", "longueur", "casse", "sens", "autre"] as const;
export type TypeCorrection = (typeof TYPES_CORRECTION)[number];
export type StatutCorrection = "proposee" | "retenue" | "ecartee";
export type VersionCorrection = "actuel" | "candidat" | "les_deux";

export interface CorrectionNative {
  id: string;
  langue: string;
  vote_id: string | null;
  duel_id: string | null;
  relecteur_id: string | null;
  version: VersionCorrection | null;
  slide: number | null;
  type: TypeCorrection;
  fautif: string;
  corrige: string | null;
  explication: string | null;
  statut: StatutCorrection;
  decide_le: string | null;
  created_at: string;
  updated_at: string;
  /** Le relecteur dont la remarque vient, s'il existe encore. */
  relecteur: { prenom: string | null; nom: string | null } | null;
}

const COLONNES = "id, langue, vote_id, duel_id, relecteur_id, version, slide, type, fautif, corrige, explication, statut, decide_le, created_at, updated_at";

/** Les corrections d'une langue, les plus récentes d'abord. */
export async function listerCorrectionsNatives(langue: string): Promise<CorrectionNative[]> {
  const { data, error } = await supabase
    .from("corrections_natives")
    .select(`${COLONNES}, relecteurs_natifs(profiles(prenom, nom))`)
    .eq("langue", langue.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((ligne) => {
    const l = ligne as Omit<CorrectionNative, "relecteur"> & {
      relecteurs_natifs?: { profiles?: { prenom: string | null; nom: string | null } | null } | null;
    };
    const { relecteurs_natifs, ...reste } = l;
    return { ...reste, relecteur: relecteurs_natifs?.profiles ?? null };
  });
}

/** Retenir, écarter ou remettre en proposée, une ou plusieurs corrections. */
export async function deciderCorrections(ids: string[], statut: StatutCorrection): Promise<void> {
  if (ids.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("corrections_natives")
    .update({
      statut,
      decide_par: auth?.user?.id ?? null,
      decide_le: statut === "proposee" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
}

export async function modifierCorrection(id: string, champs: { corrige: string | null; type: TypeCorrection }): Promise<void> {
  const corrige = (champs.corrige ?? "").trim() || null;
  const { error } = await supabase
    .from("corrections_natives")
    .update({ corrige, type: champs.type, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function supprimerCorrection(id: string): Promise<void> {
  const { error } = await supabase.from("corrections_natives").delete().eq("id", id);
  if (error) throw error;
}

/** Remarques de la langue pas encore découpées. */
export async function compterVotesAExtraire(langue: string): Promise<number> {
  const { count, error } = await supabase
    .from("ab_traduction_votes")
    .select("id", { count: "exact", head: true })
    .eq("langue", langue.toLowerCase())
    .not("remarque", "is", null)
    .is("corrections_extraites_le", null);
  if (error) throw error;
  return count ?? 0;
}

export interface BilanExtraction {
  traites: number;
  corrections: number;
  echecs: Array<{ vote_id: string; raison: string }>;
  restants: number;
}

/** Découpe les remarques non traitées de la langue (au plus `max` par appel). */
export function extraireCorrections(langue: string, max = 8): Promise<BilanExtraction> {
  return invoke<BilanExtraction>("ab-traduction", { action: "corrections_extraire", langue, max });
}

/** Le bloc que la traduction de la langue reçoit (corrections retenues), ou "" sans correction. */
export async function blocCorrectionsNatives(langue: string): Promise<string> {
  const { data, error } = await supabase.rpc("corrections_natives_bloc", { p_langue: langue });
  if (error) throw error;
  return typeof data === "string" ? data : "";
}
