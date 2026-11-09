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
