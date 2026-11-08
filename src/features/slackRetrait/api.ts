import { supabase } from "@/lib/supabase/client";

/** Une personne désactivée dans l'OS, encore membre actif de Slack (0563). */
export interface PersonneSlack {
  poster_id: string;
  nom: string;
  raison: string | null;
  arret_at: string | null;
  slack_user_id: string;
  lien_slack: string;
  canaux_retires_at: string | null;
  canaux_bilan: { retires?: string[]; echecs?: string[]; le?: string } | null;
  erreur: string | null;
  verifie_at: string | null;
}

export interface EtatSlack {
  retrait: { possible: boolean; manquent: string[] };
  desactivation: { configure: boolean; possible: boolean; detail: string | null };
}

export async function lireListe(): Promise<PersonneSlack[]> {
  const { data, error } = await supabase.rpc("slack_retraits_liste");
  if (error) throw new Error(error.message);
  return (data ?? []) as PersonneSlack[];
}

async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("slack-retrait", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const corps = ctx && typeof ctx.json === "function" ? ((await ctx.json()) as { error?: string }) : null;
      if (corps?.error) message = corps.error;
    } catch {
      /* message générique */
    }
    throw new Error(message);
  }
  return data as T;
}

export const lireEtat = () => appeler<EtatSlack & { ok: boolean }>({ action: "etat" });

export const verifier = (posterId?: string) =>
  appeler<{ ok: boolean; encore_actifs?: number; desactives?: number; error?: string }>({ action: "verifier", ...(posterId ? { poster_id: posterId } : {}) });

export const retirer = (posterId?: string) =>
  appeler<{ ok: boolean; faits?: number; restants?: number; error?: string }>({ action: "retirer", ...(posterId ? { poster_id: posterId } : {}) });

export const desactiver = (posterId: string) =>
  appeler<{ ok: boolean; manuel?: boolean; lien?: string; error?: string }>({ action: "desactiver", poster_id: posterId });
