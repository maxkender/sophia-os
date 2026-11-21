import { invoke } from "@/features/moteur/api";
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
  /** 0737 : le calcul de la paie Upwork (paie_calculer_v3). */
  tarif?: number | null;
  retenue?: number | null;
  bonus?: number;
  bonus_detail?: { type: string; montant: number; detail: string | null }[] | null;
  a_verifier?: string[];
  valide?: boolean;
  /** 0809 : pourquoi ce montant (posts, comptes, doublement, bonus, Kill, absences, panne). */
  pourquoi?: string | null;
}

export interface LigneLot {
  poster_id: string;
  nom: string;
  ruul_email: string | null;
  pays: string | null;
  semaines: SemaineLot[];
  total: number;
  alertes: string[];
  /** 0737 : statut d'onboarding lu chez Ruul, ce qui attend l'OK de Max, et si c'est validé. */
  ruul_onboarding?: string | null;
  bonus?: number;
  a_verifier?: string[];
  valide?: boolean;
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
  /** 0737 : posteurs qui attendent l'OK de Max ; lignes prêtes à partir (READY et validées). */
  a_valider?: number;
  pret?: number;
  nb_pret?: number;
  en_attente: number;
  nb_en_attente: number;
}

export interface LotRuul {
  semaine: string;
  lot: {
    id: string; statut: "prepare" | "saisi" | "paye" | "rapproche"; facture: string | null; total: number; nb: number; paye_at: string | null;
    /** 0738 : le paiement créé chez Ruul et le virement à faire. */
    ruul_batch_id?: number | null;
    ruul_env?: string | null;
    ruul_statut?: string | null;
    ruul_funding?: FundingRuul | null;
    ruul_resume?: { rows?: number; byStatus?: Record<string, number> } | null;
    ruul_cree_at?: string | null;
    ruul_envoi?: { resultat?: string; erreur?: string; essais?: number } | null;
  } | null;
  rapprochement: { email: string; nom: string | null; attendu: number | null; ruul: number | null; resultat: string }[] | null;
  lignes: LigneLot[];
  reportes: Reporte[];
  totaux?: TotauxRuul;
  /** 0737 : le devis Ruul (POST /payouts/calculate) : le total à virer, frais compris. */
  devis?: DevisRuul | null;
  devis_at?: string | null;
}

export interface FundingRuul {
  method?: string;
  currency?: string;
  dueAmount?: number | null;
  reference?: string | null;
  accounts?: { type?: string; currency?: string; country?: string; accountDetails?: Record<string, string | undefined> }[];
}

export interface DevisRuul {
  env: string;
  currency: string;
  lignes: number;
  net_usd: number;
  payment: { total?: number | null; subtotal?: number | null; ruulCommissionFee?: number | null; gatewayFee?: number | null; vatTotal?: number | null };
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
/** 0738 : la paie de la semaine vue par le posteur. */
export interface MaPaieRuul {
  semaine: string;
  total: number;
  bonus: number;
  faits: number | null;
  prevus: number | null;
  nb_comptes: number | null;
  statut: "paid" | "processing" | "scheduled" | "waiting_setup" | "problem" | "none";
  paye_at: string | null;
}
export const lireMesPaiementsRuul = () => rpc<MaPaieRuul[]>("ruul_mes_paiements");
export const creerPaiementRuul = (semaine: string) =>
  invoke<{ ok: boolean; error?: string; deja?: boolean; batch?: number; env?: string }>("ruul-api", { action: "payer", semaine });
export const relirePaiementRuul = (semaine: string) =>
  invoke<{ ok: boolean; error?: string; statut?: string }>("ruul-api", { action: "relire", semaine });
/** 0740 : ce qui reste dû face à ce que Ruul a déjà payé, et la décision de Max sur une semaine à vérifier. */
export interface VerifRuul {
  poster_id: string;
  nom: string;
  ruul_email: string | null;
  ruul_onboarding: string | null;
  du: { semaine: string; montant: number; faits: number | null; statut: string; verif: string | null }[] | null;
  total_du: number | null;
  a_verifier: number | null;
  ruul: { tno: string | null; date: string | null; montant: number | null; devise: string | null; statut: string | null; description: string | null }[] | null;
  ruul_paye: number | null;
}
export const lireVerifRuul = () => rpc<VerifRuul[]>("ruul_verif_liste");
export const deciderVerifRuul = (poster: string, semaine: string, decision: "payer" | "deja_paye", note?: string) =>
  rpc<Retour & { lignes?: number }>("ruul_verif_decider", { p_poster: poster, p_semaine: semaine, p_decision: decision, p_note: note ?? null });
export const importerHistoriqueRuul = () =>
  invoke<{ ok: boolean; error?: string; lues?: number; lignes?: number; total?: number }>("ruul-api", { action: "transactions" });
export const validerLigneRuul = (poster: string, semaine: string, ok: boolean) =>
  rpc<Retour & { lignes?: number }>("ruul_ligne_valider", { p_poster: poster, p_semaine: semaine, p_ok: ok });
export const devisLotRuul = (semaine: string) =>
  invoke<{ ok: boolean; error?: string; devis?: DevisRuul }>("ruul-api", { action: "devis", semaine });
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
  /** 17/11 (API Ruul) : le statut lu chez Ruul (READY = payable) et l'invitation automatique allumée. */
  ruul_onboarding?: string | null;
  ruul_lien_auto?: boolean;
}

/** 17/11 : le lien d'onboarding Ruul du posteur connecté (frais, < 48 h), pour le bouton « Open my Ruul setup ». */
export async function monLienRuul(): Promise<{ url: string | null; ready: boolean }> {
  const r = await invoke<{ ok: boolean; url: string | null; ready?: boolean; error?: string }>("ruul-api", { action: "mon_lien" });
  if (!r.ok) throw new Error(r.error ?? "Ruul setup unavailable");
  return { url: r.url, ready: r.ready === true };
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
