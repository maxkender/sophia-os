import { supabase } from "@/lib/supabase/client";

/**
 * 1/11 : « Set my password ». Le welcome Upwork ne donne plus de mot de passe :
 * un lien personnel ({OS}/set-password?t=…, usage unique, 14 jours) où la
 * recrue choisit le sien (manage-users, migration 0491).
 */
export type StatutLien = "ok" | "utilise" | "expire" | "inconnu";

export interface LienLu {
  statut: StatutLien;
  email: string | null;
  prenom: string | null;
}

/** Le jeton du lien (48 caractères hexadécimaux), ou null. */
export function jetonDeRecherche(recherche: string): string | null {
  const t = new URLSearchParams(recherche).get("t")?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{48}$/.test(t) ? t : null;
}

function statutDe(v: unknown): StatutLien {
  return v === "ok" || v === "utilise" || v === "expire" ? v : "inconnu";
}

export async function lireLien(jeton: string): Promise<LienLu> {
  const { data, error } = await supabase.functions.invoke("manage-users", {
    body: { action: "lien_mot_de_passe_lire", jeton },
  });
  if (error) throw error;
  const d = (data ?? {}) as { ok?: boolean; statut?: string; email?: string; prenom?: string | null };
  return { statut: d.ok ? "ok" : statutDe(d.statut), email: d.email ?? null, prenom: d.prenom ?? null };
}

/** Le mot de passe choisi ; rend le login (pour la connexion) ou l'erreur. */
export async function definirMotDePasse(
  jeton: string,
  motDePasse: string,
  emailPerso: string,
): Promise<{ email: string | null; erreur: string | null; statut?: StatutLien }> {
  const { data, error } = await supabase.functions.invoke("manage-users", {
    body: { action: "lien_mot_de_passe_definir", jeton, password: motDePasse, email_perso: emailPerso.trim().toLowerCase() },
  });
  if (error) return { email: null, erreur: error.message };
  const d = (data ?? {}) as { ok?: boolean; email?: string; error?: string; statut?: string };
  if (d.ok && d.email) return { email: d.email, erreur: null };
  return { email: null, erreur: d.error ?? null, ...(d.statut ? { statut: statutDe(d.statut) } : {}) };
}
