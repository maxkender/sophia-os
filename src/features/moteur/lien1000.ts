import { supabase } from "@/lib/supabase/client";

/**
 * Lien du profil TikTok à 1 000 abonnés (migration 0325).
 *
 * La décision vit en SQL (`lien_1000_controle`), lancée chaque lundi par le
 * cron : la page ne fait que la lire à blanc (`p_envoyer = false`), allumer
 * l'envoi automatique, ou envoyer tout de suite.
 */

export type ActionLien1000 =
  | "message"
  | "relance"
  | "lien_en_place"
  | "attente"
  | "sans_suite"
  | "fait"
  | "pas_de_releve";

/** L'ordre d'affichage : ce qui partira au prochain envoi d'abord. */
export const ORDRE_ACTIONS: readonly ActionLien1000[] = [
  "message",
  "relance",
  "lien_en_place",
  "attente",
  "sans_suite",
  "fait",
  "pas_de_releve",
];

/** Ce qu'un envoi déclenche : un pop-up (message, relance) ou un « fait ». */
export const ACTIONS_ENVOYEES: readonly ActionLien1000[] = ["message", "relance"];

export interface LigneLien1000 {
  compte_id: string;
  handle: string;
  poster: string;
  langue: string;
  abonnes: number | null;
  bio_lien: string | null;
  application: string;
  lien: string;
  action: ActionLien1000;
  message_at: string | null;
  relance_at: string | null;
  fait_at: string | null;
  releve_at: string | null;
}

/** La liste telle que l'enverrait le contrôle, sans rien écrire. */
export async function listerLien1000(): Promise<LigneLien1000[]> {
  const { data, error } = await supabase.rpc("lien_1000_controle", { p_envoyer: false });
  if (error) throw error;
  return (data ?? []) as LigneLien1000[];
}

/** Envoie maintenant (messages, relances, comptes déjà en ordre marqués faits). */
export async function envoyerLien1000(): Promise<LigneLien1000[]> {
  const { data, error } = await supabase.rpc("lien_1000_controle", { p_envoyer: true });
  if (error) throw error;
  return (data ?? []) as LigneLien1000[];
}

async function lireReglageLien1000(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "lien_1000").maybeSingle();
  if (error) throw error;
  return (data?.valeur as Record<string, unknown> | undefined) ?? {};
}

/** L'envoi automatique du lundi est-il allumé ? Éteint au départ. */
export async function lireEnvoiAutoLien1000(): Promise<boolean> {
  return (await lireReglageLien1000()).envoi_actif === true;
}

/** Ne touche qu'à `envoi_actif` : les liens et les messages du réglage restent. */
export async function ecrireEnvoiAutoLien1000(actif: boolean): Promise<void> {
  const valeur = { ...(await lireReglageLien1000()), envoi_actif: actif };
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "lien_1000", valeur, updated_at: new Date().toISOString() }, { onConflict: "cle" });
  if (error) throw error;
}

export function compterActions(lignes: LigneLien1000[]): Record<ActionLien1000, number> {
  const n = Object.fromEntries(ORDRE_ACTIONS.map((a) => [a, 0])) as Record<ActionLien1000, number>;
  for (const l of lignes) n[l.action] = (n[l.action] ?? 0) + 1;
  return n;
}

export function trierLignes(lignes: LigneLien1000[]): LigneLien1000[] {
  return [...lignes].sort(
    (a, b) =>
      ORDRE_ACTIONS.indexOf(a.action) - ORDRE_ACTIONS.indexOf(b.action) ||
      (b.abonnes ?? 0) - (a.abonnes ?? 0) ||
      a.handle.localeCompare(b.handle),
  );
}
