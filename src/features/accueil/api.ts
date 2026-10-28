import { supabase } from "@/lib/supabase/client";

/** Système du 2 nov., partie A (0401) : un accueil par contrat Upwork. */
export interface Accueil {
  contrat_id: string;
  job_id: string | null;
  job_titre: string | null;
  prenom: string | null;
  nom: string | null;
  debut_at: string | null;
  statut: "simule" | "a_relier" | "a_creer" | "doublon" | "cree" | "envoi" | "envoye" | "erreur";
  raison: string | null;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  poster_id: string | null;
  email: string | null;
  cohorte_lundi: string | null;
  message_texte: string | null;
  message_at: string | null;
  updated_at: string;
}

export async function lireAccueils(): Promise<Accueil[]> {
  const { data, error } = await supabase.from("accueils").select("*").order("debut_at", { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as Accueil[];
}

/** « Contrats à relier » : pays, langue, HM ; créé au passage suivant. */
export async function relierAccueil(contratId: string, pays: string, langue: string, hmId: string | null, retenir: boolean): Promise<void> {
  const { error } = await supabase.rpc("accueil_relier", {
    p_contrat: contratId,
    p_pays: pays,
    p_langue: langue,
    p_hm: hmId,
    p_retenir: retenir,
  });
  if (error) throw error;
}

export interface AnnoncePays {
  job_id: string;
  titre: string | null;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  tarif: number | null;
  generique: boolean;
  vue_at: string;
}

export async function lireAnnonces(): Promise<AnnoncePays[]> {
  const { data, error } = await supabase.from("annonces_pays").select("*").order("vue_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AnnoncePays[]).map((a) => ({ ...a, tarif: a.tarif === null ? null : Number(a.tarif) }));
}

export async function enregistrerAnnonce(a: Pick<AnnoncePays, "job_id" | "pays" | "langue" | "hm_id" | "tarif" | "generique">): Promise<void> {
  const { error } = await supabase.rpc("annonce_enregistrer", {
    p_job: a.job_id,
    p_pays: a.pays,
    p_langue: a.langue,
    p_hm: a.hm_id,
    p_tarif: a.tarif,
    p_generique: a.generique,
  });
  if (error) throw error;
}
