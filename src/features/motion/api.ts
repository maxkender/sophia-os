// Motion (migration 0663, fonction `motion`) : la page lit les tables, la
// fonction fait tout le reste (tâches du moteur, validation, post vidéo sur le
// compte MOTION de la langue). Seule la capture Sophia est déposée par la page
// elle-même dans `medias` (l'admin y écrit, politique 0102).

import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import { cheminCapture, type StatutLangueMotion, type StatutVideoMotion } from "./logique";

export interface LangueMotion {
  id: string;
  video_id: string;
  langue: string;
  statut: StatutLangueMotion;
  legende: string | null;
  video_url: string | null;
  video_brute_url: string | null;
  duree_s: number | null;
  commentaire: string | null;
  compte_id: string | null;
  post_id: string | null;
  validee_at: string | null;
  distribuee_at: string | null;
  updated_at: string;
}

export interface TacheMotion {
  id: string;
  type: "script" | "produire" | "corriger";
  langue: string | null;
  statut: "en_attente" | "en_cours" | "faite" | "echec";
  consigne: string | null;
  erreur: string | null;
  tentatives: number;
  created_at: string;
}

export interface VideoMotion {
  id: string;
  sujet: string;
  consigne: string | null;
  projet: string | null;
  statut: StatutVideoMotion;
  script: unknown;
  langues_visees: string[];
  capture_url: string | null;
  journal: unknown;
  erreur: string | null;
  created_at: string;
  updated_at: string;
  langues: LangueMotion[];
  taches: TacheMotion[];
}

export interface CompteMotion {
  id: string;
  langue: string | null;
  handle_tiktok: string | null;
  persona_nom: string | null;
  is_active: boolean;
}

export const CLE_VIDEOS_MOTION = ["motion", "videos"] as const;
export const CLE_COMPTES_MOTION = ["motion", "comptes"] as const;

const nombreOuNull = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/** Les vidéos, les plus récentes d'abord, avec leurs langues et leurs tâches. */
export async function listerVideosMotion(): Promise<VideoMotion[]> {
  const { data, error } = await supabase
    .from("motion_videos")
    .select(
      "id, sujet, consigne, projet, statut, script, langues_visees:langues, capture_url, journal, erreur, created_at, updated_at, " +
        "langues:motion_langues(id, video_id, langue, statut, legende, video_url, video_brute_url, duree_s, commentaire, compte_id, post_id, " +
        "validee_at, distribuee_at, updated_at), " +
        "taches:motion_taches(id, type, langue, statut, consigne, erreur, tentatives, created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as VideoMotion[]).map((v) => {
    const ordre = v.langues_visees ?? [];
    return {
      ...v,
      langues: [...(v.langues ?? [])]
        .map((l) => ({ ...l, duree_s: nombreOuNull(l.duree_s) }))
        .sort((a, b) => {
          const ia = ordre.indexOf(a.langue);
          const ib = ordre.indexOf(b.langue);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.langue.localeCompare(b.langue);
        }),
      taches: [...(v.taches ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    };
  });
}

/** Les comptes qui portent le label MOTION (1 par langue). */
export async function listerComptesMotion(): Promise<CompteMotion[]> {
  const r = await invoke<{ comptes: CompteMotion[] }>("motion", { action: "comptes" });
  return r.comptes ?? [];
}

export function creerVideoMotion(sujet: string, consigne: string, langues: string[]): Promise<{ video: { id: string } }> {
  return invoke("motion", { action: "creer", sujet, consigne, langues });
}

export function majScriptMotion(videoId: string, script: Record<string, unknown>): Promise<{ ok: true }> {
  return invoke("motion", { action: "maj_script", video_id: videoId, script });
}

export function demanderScriptMotion(videoId: string, consigne: string): Promise<{ ok: true }> {
  return invoke("motion", { action: "demander_script", video_id: videoId, consigne });
}

export function validerScriptMotion(videoId: string): Promise<{ ok: true }> {
  return invoke("motion", { action: "valider_script", video_id: videoId });
}

export function validerLangueMotion(videoId: string, langue: string): Promise<{ postId: string; compteId: string; date: string }> {
  return invoke("motion", { action: "valider_langue", video_id: videoId, langue });
}

export function rejeterLangueMotion(videoId: string, langue: string, commentaire: string): Promise<{ ok: true }> {
  return invoke("motion", { action: "rejeter_langue", video_id: videoId, langue, commentaire });
}

export function archiverVideoMotion(videoId: string): Promise<{ ok: true }> {
  return invoke("motion", { action: "archiver", video_id: videoId });
}

export function genererJetonMotion(): Promise<{ jeton: string }> {
  return invoke("motion", { action: "jeton" });
}

/**
 * Dépose la capture d'accueil Sophia (anglais) dans `medias/motion/<video>/`,
 * puis la rattache à la vidéo (la fonction remplace et retire l'ancienne).
 */
export async function deposerCaptureMotion(videoId: string, fichier: File): Promise<{ capture_url: string }> {
  const chemin = cheminCapture(videoId, fichier.name, Date.now());
  if (!chemin) throw new Error("Capture : une image PNG, JPG ou WebP");
  const { error } = await supabase.storage
    .from("medias")
    .upload(chemin, fichier, { contentType: fichier.type || undefined, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return invoke("motion", { action: "maj_capture", video_id: videoId, capture_chemin: chemin });
}
