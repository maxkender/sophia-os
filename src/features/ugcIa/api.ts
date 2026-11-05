// UGC IA (migration 0655, fonction `ugc-ia`) : la page lit les tables, la
// fonction fait tout le reste (import TikTok, coupe, Genjutsu, suivi).

import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import type { ResolutionUgcIa, StatutVideoUgcIa } from "./logique";

export interface PersonaUgcIa {
  id: string;
  nom: string;
  description: string;
  image_url: string;
}

export interface VideoUgcIa {
  id: string;
  persona_id: string;
  source_url: string;
  source_texte: string | null;
  source_vues: number | null;
  source_duree_s: number | null;
  brut_url: string | null;
  debut_s: number | null;
  fin_s: number | null;
  coupe_url: string | null;
  prompt: string | null;
  resolution: ResolutionUgcIa;
  statut: StatutVideoUgcIa;
  erreur: string | null;
  video_url: string | null;
  lancee_le: string | null;
  generee_le: string | null;
  created_at: string;
}

export const CLE_VIDEOS_UGC_IA = ["ugc-ia", "videos"] as const;

const nombreOuNull = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export async function listerPersonasUgcIa(): Promise<PersonaUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_personas")
    .select("id, nom, description, image_url")
    .eq("actif", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PersonaUgcIa[];
}

export async function listerVideosUgcIa(): Promise<VideoUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_videos")
    .select(
      "id, persona_id, source_url, source_texte, source_vues, source_duree_s, brut_url, debut_s, fin_s, coupe_url, prompt, resolution, statut, erreur, video_url, lancee_le, generee_le, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  // Les colonnes numeric peuvent revenir en texte selon la configuration de PostgREST.
  return (data ?? []).map((v) => ({
    ...(v as VideoUgcIa),
    source_vues: nombreOuNull(v.source_vues),
    source_duree_s: nombreOuNull(v.source_duree_s),
    debut_s: nombreOuNull(v.debut_s),
    fin_s: nombreOuNull(v.fin_s),
  }));
}

export function importerTiktokUgcIa(url: string, personaId: string): Promise<{ video: VideoUgcIa }> {
  return invoke("ugc-ia", { action: "importer", url, personaId });
}

export function couperPassageUgcIa(id: string, debut: number, fin: number): Promise<{ video: VideoUgcIa }> {
  return invoke("ugc-ia", { action: "couper", id, debut, fin });
}

export function genererVideoUgcIa(id: string, prompt: string, resolution: ResolutionUgcIa): Promise<{ video: VideoUgcIa }> {
  return invoke("ugc-ia", { action: "generer", id, prompt, resolution });
}

export function suivreGenerationsUgcIa(): Promise<{ bilan: Array<{ id: string; statut: string; erreur?: string }> }> {
  return invoke("ugc-ia", { action: "suivre" });
}

export function supprimerVideoUgcIa(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer", id });
}
