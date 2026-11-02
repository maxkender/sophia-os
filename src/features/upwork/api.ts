import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/** Upwork (prompt 14, 0386) : l'état de la connexion, sans jamais les jetons. */
export interface EtatUpwork {
  compte: string;
  statut: "connecte" | "deconnecte" | "erreur";
  connecte_at: string | null;
  connecte_par_nom: string | null;
  utilisateur: unknown;
  organisations: { title: string; organizationId: string }[] | null;
  droits: {
    lu_at?: string;
    scope_jeton?: string | null;
    schema_lu?: boolean;
    schema_erreur?: string | null;
    requetes?: string[];
    mutations?: string[];
    organisations_erreur?: string | null;
  } | null;
  access_expire_at: string | null;
  refresh_at: string | null;
  dernier_appel_at: string | null;
  derniere_erreur: string | null;
  appels_24h: number;
  erreurs_24h: number;
}

export async function lireEtatUpwork(): Promise<EtatUpwork[]> {
  const { data, error } = await supabase.rpc("upwork_etat");
  if (error) throw error;
  return (data ?? []) as EtatUpwork[];
}

/**
 * L'adresse d'autorisation Upwork (state à usage unique, 15 min). Prompt 25 v4 :
 * « secours » : la connexion de secours (Adrien), pour les messages seulement.
 */
export async function lienConnexionUpwork(compte: "principal" | "secours" = "principal"): Promise<string> {
  const r = await invoke<{ ok: boolean; url?: string; error?: string }>("upwork", { action: "lien", ...(compte === "secours" ? { compte } : {}) });
  if (!r.url) throw new Error(r.error ?? "lien Upwork indisponible");
  return r.url;
}

export async function diagnosticUpwork(): Promise<void> {
  await invoke("upwork", { action: "diagnostic" });
}

export interface BilanContrats {
  total: number | null;
  lus: number;
  erreur: string | null;
}

/** Point 2a : relit les contrats actifs de chaque organisation (lecture seule). */
export async function lireContratsUpwork(): Promise<Record<string, BilanContrats>> {
  const r = await invoke<{ ok: boolean; organisations?: Record<string, BilanContrats>; error?: string }>("upwork", {
    action: "contrats",
  });
  if (!r.ok || !r.organisations) throw new Error(r.error ?? "lecture des contrats impossible");
  return r.organisations;
}
