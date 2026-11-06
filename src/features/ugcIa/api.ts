// UGC IA (migrations 0656 et 0657, fonction `ugc-ia`) : la page lit les
// tables, la fonction fait tout le reste (import TikTok et CTA, coupe,
// Genjutsu, suivi, personas ajoutés par Claude).

import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import type { PartieSource, ResolutionUgcIa, StatutGenerationUgcIa } from "./logique";

export interface PersonaUgcIa {
  id: string;
  nom: string;
  description: string;
  image_url: string;
  /** Vide : image encore à l'extérieur (ajoutée par Claude), à rapatrier. */
  image_path: string | null;
}

export interface GenerationUgcIa {
  id: string;
  source_id: string;
  persona_id: string;
  debut_s: number | null;
  fin_s: number | null;
  prompt: string | null;
  resolution: ResolutionUgcIa;
  statut: StatutGenerationUgcIa;
  erreur: string | null;
  video_url: string | null;
  lancee_le: string;
  generee_le: string | null;
  created_at: string;
}

export interface SourceUgcIa {
  id: string;
  source_url: string;
  source_texte: string | null;
  source_vues: number | null;
  source_duree_s: number | null;
  brut_url: string | null;
  debut_s: number | null;
  fin_s: number | null;
  coupe_url: string | null;
  /** La partie téléphone (la démo de l'appli), gardée telle quelle. */
  telephone_debut_s: number | null;
  telephone_fin_s: number | null;
  telephone_url: string | null;
  cta_texte: string | null;
  cta_image_url: string | null;
  created_at: string;
  /** Les plus récentes d'abord. */
  generations: GenerationUgcIa[];
}

export interface ResultatLancement {
  personaId: string;
  nom: string | null;
  generationId?: string;
  erreur?: string;
}

export const CLE_SOURCES_UGC_IA = ["ugc-ia", "sources"] as const;
export const CLE_PERSONAS_UGC_IA = ["ugc-ia", "personas"] as const;

const nombreOuNull = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export async function listerPersonasUgcIa(): Promise<PersonaUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_personas")
    .select("id, nom, description, image_url, image_path")
    .eq("actif", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PersonaUgcIa[];
}

export async function listerSourcesUgcIa(): Promise<SourceUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_sources")
    .select(
      "id, source_url, source_texte, source_vues, source_duree_s, brut_url, debut_s, fin_s, coupe_url, " +
        "telephone_debut_s, telephone_fin_s, telephone_url, cta_texte, cta_image_url, created_at, " +
        "generations:ugc_ia_generations(id, source_id, persona_id, debut_s, fin_s, prompt, resolution, statut, erreur, video_url, lancee_le, generee_le, created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  // Les colonnes numeric peuvent revenir en texte selon la configuration de PostgREST.
  return ((data ?? []) as unknown as SourceUgcIa[]).map((s) => ({
    ...s,
    source_vues: nombreOuNull(s.source_vues),
    source_duree_s: nombreOuNull(s.source_duree_s),
    debut_s: nombreOuNull(s.debut_s),
    fin_s: nombreOuNull(s.fin_s),
    telephone_debut_s: nombreOuNull(s.telephone_debut_s),
    telephone_fin_s: nombreOuNull(s.telephone_fin_s),
    generations: [...(s.generations ?? [])]
      .map((g) => ({ ...g, debut_s: nombreOuNull(g.debut_s), fin_s: nombreOuNull(g.fin_s) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}

export function importerTiktokUgcIa(url: string): Promise<{ source: SourceUgcIa; avertissement?: string | null }> {
  return invoke("ugc-ia", { action: "importer", url });
}

export function lireCtaUgcIa(id: string): Promise<{ source: SourceUgcIa }> {
  return invoke("ugc-ia", { action: "lire_cta", id });
}

export function enregistrerCtaUgcIa(id: string, texte: string): Promise<{ source: SourceUgcIa }> {
  return invoke("ugc-ia", { action: "enregistrer_cta", id, texte });
}

export function couperPassageUgcIa(id: string, partie: PartieSource, debut: number, fin: number): Promise<{ source: SourceUgcIa }> {
  return invoke("ugc-ia", { action: "couper", id, partie, debut, fin });
}

export function genererUgcIa(
  sourceId: string,
  personaIds: string[],
  prompt: string,
  resolution: ResolutionUgcIa,
): Promise<{ resultats: ResultatLancement[] }> {
  return invoke("ugc-ia", { action: "generer", sourceId, personaIds, prompt, resolution });
}

export function suivreGenerationsUgcIa(): Promise<{ bilan: Array<{ id: string; statut: string; erreur?: string }> }> {
  return invoke("ugc-ia", { action: "suivre" });
}

export function supprimerSourceUgcIa(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_source", id });
}

export function supprimerGenerationUgcIa(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_generation", id });
}

export function rapatrierPersonasUgcIa(): Promise<{ bilan: Array<{ id: string; erreur?: string }> }> {
  return invoke("ugc-ia", { action: "rapatrier_personas" });
}
