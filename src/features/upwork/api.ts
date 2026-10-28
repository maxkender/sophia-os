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

/** L'adresse d'autorisation Upwork (state à usage unique, 15 min). */
export async function lienConnexionUpwork(): Promise<string> {
  const r = await invoke<{ ok: boolean; url?: string; error?: string }>("upwork", { action: "lien" });
  if (!r.url) throw new Error(r.error ?? "lien Upwork indisponible");
  return r.url;
}

export async function diagnosticUpwork(): Promise<void> {
  await invoke("upwork", { action: "diagnostic" });
}
