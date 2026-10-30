import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/** Needs you, « No channel to reach them » : ce qu'on sait du profil et les contrats à lui relier. */
export interface FicheSansCanal {
  prenom: string | null;
  nom: string | null;
  hm: string | null;
  cree_le: string;
  connexion: string | null;
  cohorte: string | null;
  reporte: boolean;
  pays: string | null;
  en_attente: { contrat_id: string; statut: string; raison: string | null; job_titre: string | null; nom: string; debut_at: string | null }[];
  offres: { offre_id: string; etat: string | null; titre: string | null; nom: string | null; debut_at: string | null; contrat_id: string | null; relie: boolean }[];
  offres_lues_at: string | null;
  libres: { contrat_id: string; nom: string | null; titre: string | null; debut_at: string | null; proche: boolean }[];
}

export async function lireFicheSansCanal(posterId: string): Promise<FicheSansCanal> {
  const { data, error } = await supabase.rpc("sans_canal_fiche", { p_poster: posterId });
  if (error) throw error;
  return data as FicheSansCanal;
}

/** Relie le contrat au profil ; le welcome part ensuite comme d'habitude. Avec un pays : l'annonce le garde. */
export async function relierSansCanal(posterId: string, contratId: string, pays: string | null): Promise<void> {
  const { error } = await supabase.rpc("sans_canal_relier", { p_poster: posterId, p_contrat: contratId, p_pays: pays });
  if (error) throw error;
}

/** Relit toutes les offres Upwork (tous états), en lecture seule. */
export async function lireOffresUpwork(): Promise<{ ok: boolean; error?: string }> {
  return await invoke<{ ok: boolean; error?: string }>("upwork", { action: "offres" });
}
