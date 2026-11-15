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
  /** 0694 : le dernier arrêt (Kill du samedi, « I do not wish to continue », 14 jours inactif). */
  arret?: { source: string; motif: string | null; at: string } | null;
}

/** « Killé le 14/11 » (Kill du samedi) ou « Arrêté le 14/11 » (le posteur, 14 jours inactif, à la main). */
export function libelleArret(a: { source: string; at: string }): string {
  const le = new Date(a.at).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric", timeZone: "Europe/Paris" });
  return a.source === "kill_samedi" ? `Killé le ${le}` : `Arrêté le ${le}`;
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
  /** 0705 : le statut du compte dans Ruul (invited | active). */
  ruul_compte?: string | null;
  semaine: string;
  montant: number;
  raison: string | null;
}

/** 0705 : « payable maintenant (Active) » et « en attente (pas encore Active) ». */
export interface TotauxRuul {
  payable: number;
  nb_payable: number;
  en_attente: number;
  nb_en_attente: number;
}

export interface LotRuul {
  semaine: string;
  lot: { id: string; statut: "prepare" | "saisi" | "paye" | "rapproche"; facture: string | null; total: number; nb: number; paye_at: string | null } | null;
  rapprochement: { email: string; nom: string | null; attendu: number | null; ruul: number | null; resultat: string }[] | null;
  lignes: LigneLot[];
  reportes: Reporte[];
  totaux?: TotauxRuul;
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

/** 0592 : la checklist du dashboard d'un posteur Ruul. */
export interface MonOnboardingRuul {
  ruul: boolean;
  cohorte_lundi: string | null;
  prenom_legal: string | null;
  nom_legal: string | null;
  ruul_email: string | null;
  email_candidature: string | null;
  handle: string | null;
  tiktok: boolean;
  warmup_lance: boolean;
  abonnements: number;
  pret_warmup: boolean;
  slack: boolean;
  ruul_statut: string | null;
  ruul_invite: boolean;
  ruul_pret: boolean;
  /** 0702 : le compte Ruul lu par l'import (invited / active), null si inconnu. */
  ruul_compte?: string | null;
}

export const lireMonOnboardingRuul = () => rpc<MonOnboardingRuul | null>("ruul_mon_onboarding");
export const jeSuisPretRuul = () => rpc<Retour>("ruul_je_suis_pret");

// --- 0681 : Agent Ruul (un agent externe ou Max colle ce qu'il lit dans Ruul) --------------

export interface AInviterRuul {
  poster_id: string;
  nom: string;
  email_ruul: string;
  pays: string | null;
  /** 0698 : « nouvelle adresse » ou « renvoyer l'invitation » (posé par le bot). */
  etiquette?: string | null;
}

export interface ImportRuul {
  id: string;
  type: "statuts" | "invites";
  at: string;
  par: string;
  lignes: number;
  appliques: number;
  nouveaux_invited: number;
  nouveaux_active: number;
  introuvables: string[];
}

export interface EtatAgentRuul {
  dernier_import_at: string | null;
  emails_ab: boolean;
  a_envoyer_a: number;
  a_envoyer_b: number;
  envoyes_a: number;
  envoyes_b: number;
  journal: ImportRuul[];
}

export interface ResultatStatuts {
  lignes: number;
  trouves: number;
  changes: number;
  a_envoyer_a: number;
  a_envoyer_b: number;
  nouveaux_invited: number;
  nouveaux_active: number;
  introuvables: string[];
  illisibles: string[];
  simulation?: boolean;
}

export async function lireAInviterRuul(): Promise<AInviterRuul[]> {
  const { data, error } = await supabase.rpc("ruul_agent_a_inviter");
  if (error) throw new Error(error.message);
  return (data ?? []) as AInviterRuul[];
}

export async function lireEtatAgentRuul(): Promise<EtatAgentRuul> {
  const { data, error } = await supabase.rpc("ruul_agent_etat");
  if (error) throw new Error(error.message);
  return data as EtatAgentRuul;
}

export async function marquerInvitesRuul(texte: string): Promise<{ emails: number; marques: number; deja: number; introuvables: string[] }> {
  const { data, error } = await supabase.rpc("ruul_agent_marquer_invites", { p_texte: texte });
  if (error) throw new Error(error.message);
  return data as { emails: number; marques: number; deja: number; introuvables: string[] };
}

export async function importerStatutsRuul(texte: string, simuler: boolean): Promise<ResultatStatuts> {
  const { data, error } = await supabase.rpc("ruul_agent_importer_statuts", { p_texte: texte, p_simuler: simuler });
  if (error) throw new Error(error.message);
  return data as ResultatStatuts;
}

/** Le pays en anglais (« ES » → « Spain ») ; un code inconnu reste tel quel, rien → « ? ». */
export function paysEnAnglais(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "?";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

/** La liste à coller dans Ruul : « nom ; email ; pays [; étiquette] » (pays de la candidature signée, en anglais), une ligne par personne. */
export function texteAInviter(l: readonly AInviterRuul[]): string {
  return l.map((p) => `${p.nom || "?"} ; ${p.email_ruul} ; ${paysEnAnglais(p.pays)}${p.etiquette ? ` ; ${p.etiquette}` : ""}`).join("\n");
}
