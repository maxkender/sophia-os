import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 22, parties 3 et 10 (0426) : les lectures d'Overview (Health, Today,
 * This week) et des Logs. Lecture seule, admin et Head of Ops.
 */

export type TacheAuto = "recrues" | "accueil" | "arrets" | "upwork" | "paie" | "tiktok" | "minuit";

export interface EtatTacheAuto {
  tache: TacheAuto;
  job: string;
  existe: boolean;
  actif: boolean;
  dernier_at: string | null;
  statut: string | null;
  message: string | null;
  /** Le dernier passage qui a vraiment agi (accueil, réponses, étapes : 0421). */
  passage_at: string | null;
  en_erreur: boolean | null;
  en_retard: boolean;
}

export interface SanteUpwork {
  statut: "connecte" | "deconnecte" | "erreur" | null;
  access_expire_at: string | null;
  derniere_erreur: string | null;
  dernier_appel_at: string | null;
  renouvellement_at: string | null;
  renouvellement_erreur: string | null;
  expire_bientot: boolean;
  alerte: boolean;
}

/** Prompt 25 v4 : chaque compte Upwork (Max, Adrien), son jeton et son compteur du jour. */
export interface SanteCompteUpwork extends Omit<SanteUpwork, "statut"> {
  compte: "principal" | "secours";
  statut: "connecte" | "deconnecte" | "erreur";
  connecte_une_fois: boolean;
  utilisateur: string | null;
  /** Les organisations vues par cette connexion (Vik Studios doit y être). */
  organisations: string | null;
  utilises: number;
  limite: boolean;
}

export interface SanteAuto {
  taches: EtatTacheAuto[];
  upwork: SanteUpwork | null;
  upwork_comptes?: SanteCompteUpwork[];
  upwork_max?: number;
}

export async function lireSante(): Promise<SanteAuto> {
  const { data, error } = await supabase.rpc("auto_sante");
  if (error) throw error;
  return data as SanteAuto;
}

export interface KillEnCours {
  id: string;
  poster_id: string;
  nom: string | null;
  etape: string;
  statut: "en_attente" | "simule";
  prevu_at: string | null;
}

export interface Aujourdhui {
  jour: string;
  /** Messages partis aujourd'hui, par type (relances, lundi, jeudi, accueil, pop-ups, réponses…). */
  messages: Record<string, number>;
  kills: KillEnCours[];
  a_lire: number;
  questions_paie: number;
  contrats_a_relier: number;
  arrets_a_la_main: number;
  paie_a_verifier: number;
}

export async function lireAujourdhui(): Promise<Aujourdhui> {
  const { data, error } = await supabase.rpc("auto_aujourdhui");
  if (error) throw error;
  return data as Aujourdhui;
}

export interface Semaine {
  lundi: string;
  aujourdhui: string;
  paie: { statut: string; bilan: { payees?: number; a_verifier?: number } | null } | null;
  paie_lignes: number;
  paie_payees: number;
  lundi_messages: number;
  lundi_soir: number;
  jeudi_lance_at: string | null;
  jeudi_nudges: number;
  samedi_lance_at: string | null;
  samedi_total: number;
  samedi_decides: number;
  kills_a_envoyer: number;
  kills_envoyes: number;
}

export async function lireSemaine(): Promise<Semaine> {
  const { data, error } = await supabase.rpc("auto_semaine");
  if (error) throw error;
  return data as Semaine;
}

export const SOURCES_JOURNAL = ["recrue", "message", "upwork", "arret", "kill", "paie", "reglage", "pause"] as const;
export type SourceJournal = (typeof SOURCES_JOURNAL)[number];

export interface LigneJournal {
  at: string;
  source: SourceJournal;
  action: string;
  /** « OS », ou le nom de la personne. */
  auteur: string;
  poster_id: string | null;
  poster_nom: string | null;
  canal: string | null;
  resultat: string | null;
  detail: string | null;
}

export interface FiltreJournal {
  du: string;
  au: string;
  source: SourceJournal | "";
  poster: string;
}

export async function lireJournal(f: FiltreJournal): Promise<LigneJournal[]> {
  const { data, error } = await supabase.rpc("auto_journal", {
    p_du: f.du || null,
    p_au: f.au || null,
    p_source: f.source || null,
    p_poster: f.poster || null,
    p_limite: 1000,
  });
  if (error) throw error;
  return (data ?? []) as LigneJournal[];
}

/** Décisions finales 4 : les messages Upwork des 7 derniers jours, par jour et par type, ceux confiés aux HM, et ce qui attend. */
export interface CompteursUpwork {
  jours: { jour: string; type: string; upwork: number; hm: number }[];
  attente: { type: string; n: number; main: number }[];
}

export async function lireCompteursUpwork(): Promise<CompteursUpwork> {
  const { data, error } = await supabase.rpc("sante_messages_upwork");
  if (error) throw error;
  return (data ?? { jours: [], attente: [] }) as CompteursUpwork;
}
