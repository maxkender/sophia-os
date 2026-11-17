import { supabase } from "@/lib/supabase/client";

import type { Reponses } from "./questions";

/** 15/11 : le questionnaire public (sans connexion) et sa page admin. */

const URL_FONCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/questionnaire`;
const CLE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface Identite {
  nom: string;
  email: string;
  tiktok: string;
}

export interface Brouillon {
  identite: Identite;
  reponses: Reponses;
  captures: Record<string, string[]>;
  ecran: number;
  termine: boolean;
}

async function appeler<T>(corps: Record<string, unknown>): Promise<T> {
  const r = await fetch(URL_FONCTION, {
    method: "POST",
    headers: { "content-type": "application/json", ...(CLE_ANON ? { apikey: CLE_ANON, authorization: `Bearer ${CLE_ANON}` } : {}) },
    body: JSON.stringify(corps),
  });
  const data = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || data.ok === false) throw new Error(data.error ?? "Something went wrong, please try again.");
  return data;
}

export function sauverReponses(slug: string, jeton: string, b: Brouillon, termine = false): Promise<{ ok: true }> {
  return appeler({
    action: "sauver", slug, jeton, nom: b.identite.nom, email: b.identite.email, tiktok: b.identite.tiktok,
    reponses: b.reponses, captures: b.captures, section: b.ecran, termine,
  });
}

/** Une capture : lien d'envoi signé (serveur), puis envoi direct dans l'espace privé. */
export async function envoyerCapture(slug: string, jeton: string, question: string, fichier: File): Promise<string> {
  const lien = await appeler<{ chemin: string; token: string }>({
    action: "televerser", slug, jeton, question, type: fichier.type || "image/jpeg", taille: fichier.size,
  });
  const { error } = await supabase.storage.from("questionnaires").uploadToSignedUrl(lien.chemin, lien.token, fichier, {
    contentType: fichier.type || "image/jpeg",
  });
  if (error) throw new Error("The upload failed, please try again.");
  return lien.chemin;
}

/** Le jeton de ce navigateur pour ce questionnaire (la sauvegarde automatique s'y rattache). */
export function jetonNavigateur(slug: string): string {
  const cle = `questionnaire:${slug}:jeton`;
  try {
    const deja = localStorage.getItem(cle);
    if (deja && /^[A-Za-z0-9-]{20,64}$/.test(deja)) return deja;
    const neuf = crypto.randomUUID();
    localStorage.setItem(cle, neuf);
    return neuf;
  } catch {
    return crypto.randomUUID();
  }
}

export function lireBrouillonLocal(slug: string): Brouillon | null {
  try {
    const t = localStorage.getItem(`questionnaire:${slug}:brouillon`);
    return t ? (JSON.parse(t) as Brouillon) : null;
  } catch {
    return null;
  }
}

export function ecrireBrouillonLocal(slug: string, b: Brouillon): void {
  try {
    localStorage.setItem(`questionnaire:${slug}:brouillon`, JSON.stringify(b));
  } catch {
    /* navigation privée : la sauvegarde serveur suffit */
  }
}

// --- Admin -------------------------------------------------------------------------------------------

export interface DonneesOs {
  nom_os: string | null;
  handle: string | null;
  classement: string | null;
  langue: string | null;
  labels: string | null;
  warmup_start: string | null;
  abonnements: number | null;
  premier_post: string | null;
  vues_mediane_30j: number | null;
  vues_moyenne_30j: number | null;
  posts_30j: number | null;
}

export interface LigneReponse {
  id: string;
  nom: string | null;
  email: string | null;
  tiktok: string | null;
  poster_id: string | null;
  relie_par: string | null;
  reponses: Reponses;
  captures: Record<string, string[]>;
  section: number;
  termine_at: string | null;
  maj_at: string;
  os: DonneesOs | null;
}

export async function lireReponsesAdmin(slug: string): Promise<LigneReponse[]> {
  const { data, error } = await supabase.rpc("questionnaire_admin", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneReponse[];
}

export interface PosteurChoix {
  id: string;
  nom: string | null;
  handle: string | null;
  classement: string | null;
  popup: "envoye" | "plus_tard" | "repondu" | null;
  repondu: boolean;
}

export async function lirePosteursChoix(slug: string): Promise<PosteurChoix[]> {
  const { data, error } = await supabase.rpc("questionnaire_posteurs", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data ?? []) as PosteurChoix[];
}

export async function envoyerPopup(slug: string, posters: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("questionnaire_popup_envoyer", { p_slug: slug, p_posters: posters });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; envoyes?: number; error?: string };
  if (!r.ok) throw new Error(r.error ?? "pop-up non envoyé");
  return r.envoyes ?? 0;
}

export async function lienCapture(chemin: string): Promise<string | null> {
  const { data } = await supabase.storage.from("questionnaires").createSignedUrl(chemin, 3600);
  return data?.signedUrl ?? null;
}

// --- Pop-up posteur ----------------------------------------------------------------------------------

export async function lireMonPopup(): Promise<{ slug: string; titre: string } | null> {
  const { data, error } = await supabase.rpc("questionnaire_popup_mien");
  if (error) throw new Error(error.message);
  return (data ?? null) as { slug: string; titre: string } | null;
}

export async function fermerPopup(slug: string, ouvert: boolean): Promise<void> {
  const { error } = await supabase.rpc("questionnaire_popup_fermer", { p_slug: slug, p_ouvert: ouvert });
  if (error) throw new Error(error.message);
}

export const lienQuestionnaire = (slug: string, origine = typeof window !== "undefined" ? window.location.origin : "") =>
  `${origine}/questionnaire/${slug}`;
