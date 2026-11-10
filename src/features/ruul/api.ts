import { supabase } from "@/lib/supabase/client";

/** 0574 : les posteurs payés par Ruul. */
export type StatutRuul = "a_ajouter" | "invite" | "pret" | "paye_1x";

export interface PosteurRuul {
  poster_id: string;
  nom: string;
  prenom_legal: string | null;
  nom_legal: string | null;
  ruul_email: string | null;
  ruul_statut: StatutRuul | null;
  pays: string | null;
  cohorte: string | null;
  actif: boolean;
  ajoute_at: string | null;
  pret_at: string | null;
  premier_paiement_at: string | null;
  relances: number;
  relance_at: string | null;
  stop_at: string | null;
  du: number;
}

export interface SemaineLot {
  id: string;
  semaine: string;
  montant: number;
  rattrapage: boolean;
  statut: string;
  nb_comptes: number | null;
  faits: number | null;
  prevus: number | null;
  paye_at: string | null;
  ecart: string | null;
}

export interface LigneLot {
  poster_id: string;
  nom: string;
  ruul_email: string | null;
  pays: string | null;
  semaines: SemaineLot[];
  total: number;
  alertes: string[];
}

export interface Reporte {
  poster_id: string;
  nom: string;
  ruul_statut: StatutRuul | null;
  semaine: string;
  montant: number;
  raison: string | null;
}

export interface LotRuul {
  semaine: string;
  lot: { id: string; statut: "prepare" | "saisi" | "paye" | "rapproche"; facture: string | null; total: number; nb: number; paye_at: string | null } | null;
  rapprochement: { email: string; nom: string | null; attendu: number | null; ruul: number | null; resultat: string }[] | null;
  lignes: LigneLot[];
  reportes: Reporte[];
}

export interface TableauRuul {
  mode: string;
  statuts: Partial<Record<StatutRuul | "aucun", number>>;
  semaine: string;
  lot: { statut: string; total: number; nb: number; facture: string | null } | null;
  rattrapages: { nb: number; total: number };
  reportes: number;
}

type Retour = { ok: boolean; erreur?: string };

async function rpc<T>(nom: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const lirePosteursRuul = () => rpc<PosteurRuul[]>("ruul_posteurs");
export const lireTableauRuul = () => rpc<TableauRuul>("ruul_tableau");
export const lireLotRuul = (semaine?: string) => rpc<LotRuul>("ruul_lot", semaine ? { p_semaine: semaine } : {});
export const preparerLotRuul = (semaine: string) => rpc<Retour & { nb?: number; total?: number }>("ruul_lot_preparer", { p_semaine: semaine });
export const saisirLotRuul = (semaine: string, facture: string) => rpc<Retour>("ruul_lot_saisir", { p_semaine: semaine, p_facture: facture });
export const payerLotRuul = (semaine: string) => rpc<Retour & { payes?: number }>("ruul_lot_payer", { p_semaine: semaine });
export const rapprocherLotRuul = (semaine: string, lignes: { email: string; montant: string }[]) =>
  rpc<Retour & { ecarts?: number }>("ruul_lot_rapprocher", { p_semaine: semaine, p_lignes: lignes });
export const changerStatutRuul = (poster: string, statut: StatutRuul | null, email?: string | null) =>
  rpc<Retour>("ruul_statut_changer", { p_poster: poster, p_statut: statut, p_email: email ?? null });

/** 0577 : une candidature du site, copiée dans l'OS. */
export interface CandidatureRuul {
  site_id: string;
  nom: string | null;
  email: string | null;
  pays: string | null;
  pays_brut: string | null;
  referral: boolean;
  parrain_nom: string | null;
  statut_site: string | null;
  cree_at: string | null;
  accepte_at: string | null;
  signe_at: string | null;
  start_monday: string | null;
  decision: "auto" | "acceptee" | "refusee" | "a_traiter" | null;
  decision_raison: string | null;
  manques: string[] | null;
  hm_nom: string | null;
  envoi: "a_envoyer" | "envoye" | "erreur" | null;
  envoi_erreur: string | null;
  relances_signature: number;
  desinscrit_at: string | null;
  reponses: Record<string, string>;
}

export interface LigneCohorteRuul {
  site_id: string;
  nom: string | null;
  pays: string | null;
  referral: boolean;
  cohorte: string | null;
  poster_id: string | null;
  stop: boolean;
  etapes: Record<string, string | null>;
}

export const lireCandidaturesRuul = () => rpc<CandidatureRuul[]>("ruul_candidatures_liste");
export const deciderCandidatureRuul = (siteId: string, decision: "acceptee" | "refusee", raison?: string) =>
  rpc<Retour>("ruul_candidature_decider", { p_site_id: siteId, p_decision: decision, p_raison: raison ?? null });
export const lireCohortesRuul = () => rpc<LigneCohorteRuul[]>("ruul_cohortes");

/** 10/11 : l'email Ruul du posteur connecté (bandeau de l'espace posteur). */
export interface MonEmailRuul {
  ruul: boolean;
  email: string | null;
}

export const lireMonEmailRuul = () => rpc<MonEmailRuul>("ruul_mon_email");
export const enregistrerMonEmailRuul = (email: string) => rpc<Retour>("ruul_mon_email_enregistrer", { p_email: email });

/** 0591 : un posteur Ruul à ajouter dans Ruul (email Ruul donné, pas encore ajouté). */
export interface LigneAjoutRuul {
  poster_id: string;
  nom: string;
  ruul_email: string;
  pays: string | null;
  zone: string | null;
  tarif: number | null;
}

export const lireAjoutsRuul = () => rpc<LigneAjoutRuul[]>("ruul_a_ajouter_liste");
export const marquerAjoutesRuul = (ids: string[]) => rpc<number>("ruul_marquer_ajoutes", { p_ids: ids });
