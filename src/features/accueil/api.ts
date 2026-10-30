import { invoke } from "@/features/moteur/api";
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
  /** 0470 : où vit le freelance (lu à l'API), la HM du contrat, d'où vient le pays, l'écart avec l'annonce. */
  freelance_pays?: string | null;
  freelance_ville?: string | null;
  freelance_requete?: string | null;
  hm_upwork_nom?: string | null;
  superviseur_upwork_nom?: string | null;
  pays_source?: "main" | "annonce" | "freelance" | null;
  ecart_pays?: string | null;
  /** L'équipe Upwork du contrat (upwork_contrats.organisation_nom). */
  equipe?: string | null;
}

export async function lireAccueils(): Promise<Accueil[]> {
  const { data, error } = await supabase.from("accueils").select("*").order("debut_at", { ascending: false }).limit(300);
  if (error) throw error;
  const lignes = (data ?? []) as Accueil[];
  // 0470 : l'équipe Upwork de chaque contrat à relier.
  const ids = lignes.filter((a) => a.statut === "a_relier").map((a) => a.contrat_id);
  if (ids.length === 0) return lignes;
  const { data: orgs } = await supabase.from("upwork_contrats").select("contrat_id, organisation_nom").in("contrat_id", ids);
  const equipe = new Map((orgs ?? []).map((o) => [String(o.contrat_id), (o.organisation_nom as string | null)?.trim() ?? null]));
  return lignes.map((a) => (equipe.has(a.contrat_id) ? { ...a, equipe: equipe.get(a.contrat_id) } : a));
}

/** 0470 : la carte « Contract to link » : posteur créé, relié, welcome envoyé, en un clic. L'erreur remonte telle quelle. */
export async function creerAccueil(contratId: string, pays: string, hmId: string): Promise<{ statut?: string; raison?: string | null }> {
  const r = await invoke<{ ok: boolean; error?: string; statut?: string; raison?: string | null }>("upwork", {
    action: "accueil_creer", contrat_id: contratId, pays, hm_id: hmId, confirmer: true,
  });
  if (!r.ok) throw new Error(r.error ?? "création refusée");
  return r;
}

export interface Localisation {
  contrat_id: string;
  nom: string;
  erreur?: string | null;
  freelance?: { pays: string | null; ville: string | null; requete: string | null };
  plan?: { statut: string; pays: string | null; source: string | null; hm: string | null; raison: string | null; ecart: string | null };
}

/** 0470 : relit à l'API où vit le freelance et la HM du contrat (lecture seule ; rien n'est créé). */
export async function localiserAccueils(contrats?: string[]): Promise<Localisation[]> {
  const r = await invoke<{ ok: boolean; error?: string; resultats: Localisation[] }>("upwork", { action: "accueil_localiser", ...(contrats ? { contrats } : {}) });
  if (r.error) throw new Error(r.error);
  return r.resultats ?? [];
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

export interface BilanAmorcage {
  ok: boolean;
  posteurs: number;
  lus: number;
  annonces: number;
  avec_pays: number;
  generiques: number;
  deja_dites: number;
  erreurs: string[];
  error?: string;
}

/** Remplir les annonces depuis les posteurs déjà embauchés (lecture seule sur Upwork). */
export async function amorcerAnnonces(): Promise<BilanAmorcage> {
  const r = await invoke<BilanAmorcage>("upwork", { action: "annonces_amorcer" });
  if (r.error) throw new Error(r.error);
  return r;
}
