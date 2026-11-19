/**
 * La boucle de correction (0630) : les remarques des relecteurs natifs
 * découpées en corrections atomiques (`corrections_natives`), retenues ou
 * écartées par l'admin. Une correction de LANGUE (`application_id` nul) entre
 * dans la traduction de la langue, commune à toutes les applications (bloc
 * `corrections_natives_bloc`). Une correction PROPRE À UNE APPLICATION (0751)
 * ne va qu'au placement de cette application. Écriture admin (RLS).
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
  /** La relecture simple dont elle vient (0631), sinon un duel. */
  relecture_id: string | null;
  relecteur_id: string | null;
  version: VersionCorrection | null;
  slide: number | null;
  type: TypeCorrection;
  fautif: string;
  corrige: string | null;
  explication: string | null;
  statut: StatutCorrection;
  /**
   * 0751 : `null` = correction de langue (toutes les applications) ; sinon
   * l'application à laquelle elle est propre. `undefined` : la colonne
   * n'existe pas encore en base (migration à appliquer).
   */
  application_id?: string | null;
  decide_le: string | null;
  created_at: string;
  updated_at: string;
  /** Le relecteur dont la remarque vient, s'il existe encore. */
  relecteur: { prenom: string | null; nom: string | null } | null;
  /** La remarque brute du relecteur (duel ou post publié) dont la ligne a été découpée par le modèle. */
  remarque_source: string | null;
}

const COLONNES = "id, langue, vote_id, duel_id, relecture_id, relecteur_id, version, slide, type, fautif, corrige, explication, statut, decide_le, created_at, updated_at";

/** La colonne `application_id` manque tant que 0751 n'est pas appliquée. */
function colonneAbsente(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204" || /application_id/.test(error.message ?? "")));
}

/** Les corrections d'une langue, les plus récentes d'abord. */
export async function listerCorrectionsNatives(langue: string): Promise<CorrectionNative[]> {
  const lire = (colonnes: string) =>
    supabase
      .from("corrections_natives")
      .select(`${colonnes}, relecteurs_natifs(profiles(prenom, nom)), ab_traduction_votes(remarque), relectures_posts(remarque, slides_corrigees)`)
      .eq("langue", langue.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(500);
  let { data, error } = await lire(`${COLONNES}, application_id`);
  // Avant 0751 : la liste reste lisible, sans l'application.
  if (colonneAbsente(error)) ({ data, error } = await lire(COLONNES));
  if (error) throw error;
  return (data ?? []).map((ligne) => {
    const l = ligne as unknown as Omit<CorrectionNative, "relecteur" | "remarque_source"> & {
      relecteurs_natifs?: { profiles?: { prenom: string | null; nom: string | null } | null } | null;
      ab_traduction_votes?: { remarque: string | null } | null;
      relectures_posts?: { remarque: string | null; slides_corrigees: Array<{ position: number; texte: string }> | null } | null;
    };
    const { relecteurs_natifs, ab_traduction_votes, relectures_posts, ...reste } = l;
    const reecrites = (relectures_posts?.slides_corrigees ?? []).map((r) => `slide ${r.position} : ${r.texte}`).join("\n");
    const remarque = ab_traduction_votes?.remarque ?? relectures_posts?.remarque ?? null;
    return {
      ...reste,
      relecteur: relecteurs_natifs?.profiles ?? null,
      remarque_source: [remarque, reecrites].filter(Boolean).join("\n") || null,
    };
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

/** Les corrections proposées, toutes langues : ce qui attend un tri. */
export async function compterProposees(): Promise<number> {
  const { count, error } = await supabase
    .from("corrections_natives")
    .select("id", { count: "exact", head: true })
    .eq("statut", "proposee");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Retient d'un coup toutes les corrections proposées, d'une langue ou de
 * toutes (`langue` omise). Par filtre et non par liste d'ids : plusieurs
 * centaines d'ids ne tiennent pas dans l'URL de la requête. Rend le nombre de
 * corrections retenues.
 */
export async function retenirProposees(langue?: string): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  const maintenant = new Date().toISOString();
  let requete = supabase
    .from("corrections_natives")
    .update({ statut: "retenue", decide_par: auth?.user?.id ?? null, decide_le: maintenant, updated_at: maintenant }, { count: "exact" })
    .eq("statut", "proposee");
  if (langue) requete = requete.eq("langue", langue.toLowerCase());
  const { count, error } = await requete;
  if (error) throw error;
  return count ?? 0;
}

export async function modifierCorrection(id: string, champs: { corrige: string | null; type: TypeCorrection }): Promise<void> {
  const corrige = (champs.corrige ?? "").trim() || null;
  const { error } = await supabase
    .from("corrections_natives")
    .update({ corrige, type: champs.type, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Range une correction : `null` = toute la langue, sinon l'application à laquelle elle est propre (0751). */
export async function rangerCorrection(id: string, applicationId: string | null): Promise<void> {
  const { error } = await supabase
    .from("corrections_natives")
    .update({ application_id: applicationId, updated_at: new Date().toISOString() })
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

/** Le bloc que la traduction de la langue reçoit (règles et corrections de langue retenues), ou "" sans correction. */
export async function blocCorrectionsNatives(langue: string): Promise<string> {
  const { data, error } = await supabase.rpc("corrections_natives_bloc", { p_langue: langue });
  if (error) throw error;
  return typeof data === "string" ? data : "";
}
