import { supabase } from "@/lib/supabase/client";

/**
 * La liste de paie du lundi (0380), pour l'admin et le Head of Ops : une
 * ligne par posteur, regroupée par équipe (une HM et sa zone).
 */
export type ActionPaie = "payer" | "payer_moins" | "kill" | "modifier" | "annuler" | "rien";

export type SuivantePaie =
  | "financer"
  | "financer_double"
  | "financer_normal"
  | "ne_pas_financer"
  | "deja_financee"
  | "a_voir";

export interface CompteDetailPaie {
  compte_id: string;
  handle: string | null;
  attendus: number;
  faits: number;
  rates: number;
  retenue: number;
  montant: number;
  warmup: boolean;
}

export interface LigneListePaie {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_id: string | null;
  hm_prenom: string | null;
  equipe: string | null;
  contrat_url: string | null;
  nb_comptes: number;
  comptes_payes: number;
  prevus: number;
  faits: number;
  tarif: number | null;
  retenue: number;
  /** Le montant de la règle ; `montant` est celui à payer (corrigé par Lucia s'il l'a été). */
  montant_calcule: number;
  montant: number;
  montant_corrige: number | null;
  raison_correction: string | null;
  statut: "ok" | "a_voir";
  raison: string | null;
  action: ActionPaie;
  detail_comptes: CompteDetailPaie[];
  exclu: boolean;
  exclu_raison: string | null;
  paye_at: string | null;
  semaine_suivante_faite_at: string | null;
  /** 1re semaine de posts du posteur (0388) : `bonus` ajouté au montant à approuver. */
  premiere_semaine: boolean;
  bonus: number;
  /** La milestone de la semaine d'après (0369, 0388). */
  suivante_action: SuivantePaie | null;
  suivante_comptes: number | null;
  suivante_montant: number | null;
  suivante_raison: string | null;
  /** Vik Studios / compte perso / Micabo : vide tant que les contrats ne sont pas reliés (prompt 14). */
  upwork_compte: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * La liste enregistrée du lundi, ou `simulation` : la même calculée avec les
 * règles v3 sur les données d'aujourd'hui, sans rien enregistrer (0380), avec
 * la 1re semaine et la milestone de la semaine d'après (0388).
 */
export async function lireListePaie(lundi: string, simulation = false): Promise<LigneListePaie[]> {
  const { data, error } = await supabase.rpc("paie_liste_v2", { p_lundi: lundi, p_simulation: simulation });
  if (error) throw error;
  return ((data ?? []) as LigneListePaie[]).map((l, i) => ({
    ...l,
    // Une ligne simulée n'a pas d'id en base.
    id: l.id ?? `simulation-${l.poster_id}-${i}`,
    tarif: num(l.tarif),
    retenue: Number(l.retenue),
    montant_calcule: Number(l.montant_calcule),
    montant: Number(l.montant),
    montant_corrige: num(l.montant_corrige),
    bonus: Number(l.bonus ?? 0),
    premiere_semaine: Boolean(l.premiere_semaine),
    suivante_montant: num(l.suivante_montant),
    detail_comptes: (l.detail_comptes ?? []).map((c) => ({ ...c, retenue: Number(c.retenue), montant: Number(c.montant) })),
  }));
}

/** Corriger le montant (raison obligatoire) ; null : revenir au montant calculé. */
export async function corrigerPaie(id: string, montant: number | null, raison: string): Promise<void> {
  const { error } = await supabase.rpc("paie_corriger", { p_id: id, p_montant: montant, p_raison: raison });
  if (error) throw error;
}

/** Retirer de la liste (raison obligatoire), ou remettre. */
export async function exclurePaie(id: string, exclu: boolean, raison: string): Promise<void> {
  const { error } = await supabase.rpc("paie_exclure", { p_id: id, p_exclu: exclu, p_raison: raison });
  if (error) throw error;
}

export interface ReglagesPaie {
  seuil_posts_complets: number;
  retenue_par_post: number;
}

export async function lireReglagesPaie(): Promise<{ paie: ReglagesPaie; parrainageActif: boolean }> {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["paie", "bonus_parrainage_actif"]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const paie = (v.paie ?? {}) as Partial<ReglagesPaie>;
  return {
    paie: {
      seuil_posts_complets: Number(paie.seuil_posts_complets ?? 10),
      retenue_par_post: Number(paie.retenue_par_post ?? 1),
    },
    parrainageActif: v.bonus_parrainage_actif === true,
  };
}

export async function enregistrerReglagesPaie(paie: ReglagesPaie, parrainageActif: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("reglages").upsert([
    { cle: "paie", valeur: paie, ...par },
    { cle: "bonus_parrainage_actif", valeur: parrainageActif, ...par },
  ]);
  if (error) throw error;
}
