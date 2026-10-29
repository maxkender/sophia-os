import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/** Prompt 25 MAJ, 7a : relier son Slack (lien du DM, ou « Connect my Slack »). */
export const RETOUR_SLACK = "/lier-slack";
const CLE_ETAT = "slack_connect_state";

export async function monSlackRelie(): Promise<boolean> {
  const { data, error } = await supabase.rpc("mon_slack");
  if (error) throw error;
  return Boolean((data as { relie?: boolean } | null)?.relie);
}

export async function lierParJeton(jeton: string): Promise<{ ok: boolean; statut?: string; error?: string }> {
  const { data, error } = await supabase.rpc("slack_lier_jeton", { p_jeton: jeton });
  if (error) throw error;
  return data as { ok: boolean; statut?: string; error?: string };
}

function aleatoire(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** L'URL « Sign in with Slack » ; null si l'appli Slack n'est pas configurée. */
export async function urlConnecterSlack(origine = window.location.origin): Promise<string | null> {
  const state = aleatoire();
  try {
    sessionStorage.setItem(CLE_ETAT, state);
  } catch {
    // Stockage refusé : le retour sera refusé aussi (état introuvable).
  }
  const r = await invoke<{ ok: boolean; disponible?: boolean; url?: string; error?: string }>("ckd", {
    action: "slack_connect_url", redirect_uri: `${origine}${RETOUR_SLACK}`, state, nonce: aleatoire(),
  });
  return r.ok && r.disponible && r.url ? r.url : null;
}

/** Le retour de Slack : l'état doit être celui qu'on a envoyé. */
export async function finirConnexionSlack(code: string, state: string, origine = window.location.origin): Promise<{ ok: boolean; error?: string }> {
  let attendu: string | null = null;
  try {
    attendu = sessionStorage.getItem(CLE_ETAT);
    sessionStorage.removeItem(CLE_ETAT);
  } catch {
    attendu = null;
  }
  if (!attendu || attendu !== state) return { ok: false, error: "etat" };
  return await invoke<{ ok: boolean; error?: string }>("ckd", { action: "slack_connect", code, redirect_uri: `${origine}${RETOUR_SLACK}` });
}
