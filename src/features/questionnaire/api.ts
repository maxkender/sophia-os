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

/** 20/11 : `bonus_lundi` : le lundi où le bonus est ajouté à la paie (questionnaire terminé, posteur ciblé). */
export function sauverReponses(slug: string, jeton: string, b: Brouillon, termine = false, langue = "en"): Promise<{ ok: true; bonus_lundi?: string | null }> {
  return appeler({
    action: "sauver", slug, jeton, nom: b.identite.nom, email: b.identite.email, tiktok: b.identite.tiktok, langue,
    reponses: b.reponses, captures: b.captures, section: b.ecran, termine,
  });
}

/** 20/11 : les textes du questionnaire et du pop-up dans une langue (anglais si inconnue ou si la traduction échoue). */
export function lireTextes(slug: string, langue: string): Promise<{ langue: string; textes: Record<string, string> }> {
  return appeler({ action: "textes", slug, langue });
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
  /** 20/11 : la langue du formulaire, les réponses écrites traduites en français, le bonus. */
  langue?: string | null;
  reponses_fr?: Record<string, string> | null;
  bonus?: { lundi: string; statut: string; canal: string; montant: number } | null;
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

export interface MonPopup {
  slug: string;
  titre: string;
  bonus?: number;
  /** 20/11 : la langue de son compte (le pop-up et le questionnaire s'affichent dedans). */
  langue?: string;
  plus_tard_restants?: number;
}

export async function lireMonPopup(): Promise<MonPopup | null> {
  const { data, error } = await supabase.rpc("questionnaire_popup_mien");
  if (error) throw new Error(error.message);
  return (data ?? null) as MonPopup | null;
}

export async function fermerPopup(slug: string, ouvert: boolean): Promise<void> {
  const { error } = await supabase.rpc("questionnaire_popup_fermer", { p_slug: slug, p_ouvert: ouvert });
  if (error) throw new Error(error.message);
}

export const lienQuestionnaire = (slug: string, origine = typeof window !== "undefined" ? window.location.origin : "", langue?: string) =>
  `${origine}/questionnaire/${slug}${langue && langue !== "en" ? `?lang=${encodeURIComponent(langue)}` : ""}`;

// --- 20/11 : les cibles (star + 30 meilleurs sur 14 jours) et le bonus ---------------------------------

export interface Cible {
  poster_id: string;
  nom: string;
  canal_paie: string;
  langue: string;
  star: boolean;
  rang: number | null;
  vues_mediane: number | null;
  pct_viraux: number | null;
  posts: number | null;
  popup: "envoye" | "repondu" | "plus_tard_3" | null;
}

export async function lireCibles(slug: string): Promise<Cible[]> {
  const { data, error } = await supabase.rpc("questionnaire_cibles", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data ?? []) as Cible[];
}

/** Le pop-up aux cibles qui ne l'ont pas encore (au clic de Max seulement). */
export async function envoyerCibles(slug: string): Promise<number> {
  const { data, error } = await supabase.rpc("questionnaire_cibles_envoyer", { p_slug: slug });
  if (error) throw new Error(error.message);
  return Number((data as { envoyes?: number } | null)?.envoyes ?? 0);
}

export interface BonusQuestionnaire {
  id: string;
  poster_id: string;
  nom: string;
  canal_paie: "upwork" | "ruul";
  lundi: string;
  montant: number;
  statut: "a_valider" | "a_payer" | "paye" | "retire";
  envoi_at: string | null;
  paye_at: string | null;
  erreur: string | null;
}

export async function lireBonusQuestionnaire(): Promise<BonusQuestionnaire[]> {
  const { data, error } = await supabase.rpc("questionnaire_bonus_lire");
  if (error) throw new Error(error.message);
  return ((data ?? []) as BonusQuestionnaire[]).map((b) => ({ ...b, montant: Number(b.montant) }));
}
