// A/B de la traduction et du placement (migration 0620, fonction `ab-traduction`).
// Le réglage et le rapport en base ; les duels à l'aveugle de Tests : un
// slideshow déjà publié, son deck parti (`actuel`) contre celui d'un nouveau
// circuit (`candidat`), montrés à gauche ou à droite au hasard.

import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export type ChoixDuel = "actuel" | "candidat" | "egal";

export interface SlideDuel {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}

export interface Duel {
  id: string;
  post_id: string | null;
  langue: string;
  candidat: string;
  version: string;
  statut: "pret" | "echec";
  erreur: string | null;
  slides_source: SlideDuel[];
  slides_actuel: SlideDuel[];
  slides_candidat: SlideDuel[];
  hashtags_actuel: string | null;
  hashtags_candidat: string | null;
  vues_actuel: number | null;
  gauche: "actuel" | "candidat";
  /** Le CTA commandé au nouveau circuit (voie, forme) et son refus éventuel. */
  voie_cta: string | null;
  forme_cta: string | null;
  cta_refus: string | null;
  choix: ChoixDuel | null;
  remarque: string | null;
  created_at: string;
}

export interface CircuitAb {
  id: string;
  version: string;
  nom: string;
  applications: string[] | null;
}

export interface ReglageAb {
  actif: boolean;
  langues: string[];
  part_natif: number;
  graine: string;
  circuit_production: string | null;
}

export interface BrasAb {
  assignes: number;
  publies: number;
  mesures: number;
  r_median: number | null;
  part_10k: number | null;
  vues_par_post: number | null;
  servis_natif: number;
}

export interface DecompteDuels {
  langue: string;
  candidat: string;
  version: string;
  duels: number;
  votes: number;
  candidat_gagne: number;
  actuel_gagne: number;
  egal: number;
}

export interface RapportAb {
  reglage: ReglageAb | null;
  bras: Partial<Record<"temoin" | "natif", BrasAb>>;
  ecart: { part_10k: number; marge_95: number } | null;
  /** Le bras natif, voie de CTA par voie (posts servis en natif). */
  natif_par_voie: Record<string, Pick<BrasAb, "publies" | "mesures" | "r_median" | "part_10k">>;
  duels: DecompteDuels[];
}

export async function lireRapportAb(langue: string | null): Promise<RapportAb> {
  const { data, error } = await supabase.rpc("ab_traduction_rapport", { p_langue: langue, p_depuis: null });
  if (error) throw error;
  return data as RapportAb;
}

export async function reglerAb(patch: Partial<Pick<ReglageAb, "actif" | "langues" | "part_natif">>): Promise<ReglageAb> {
  const { data, error } = await supabase.rpc("ab_traduction_regler", { p_reglage: patch });
  if (error) throw error;
  return data as ReglageAb;
}

export async function listerCircuits(): Promise<CircuitAb[]> {
  const r = await invoke<{ circuits: CircuitAb[] }>("ab-traduction", { action: "circuits" });
  return r.circuits ?? [];
}

/** Prépare UN duel (le candidat fait 2 à 4 appels modèle). */
export function preparerDuel(langue: string, candidat: string) {
  return invoke<{ ok: boolean; duel_id?: string; raison?: string }>("ab-traduction", {
    action: "duel_preparer",
    langue,
    candidat,
  });
}

export interface BilanCuisson {
  ok: boolean;
  ignore?: string;
  jour?: string;
  version?: string;
  a_cuire?: number;
  cuits?: number;
  echecs?: Array<{ contenu_id: string; langue: string; raison: string }>;
  restants?: number;
}

/** Cuit les decks du bras natif pour le plan BLEO de demain (ce que le budget d'un appel permet). */
export function cuireDecksNatifs() {
  return invoke<BilanCuisson>("ab-traduction", { action: "cuire" });
}

export async function listerDuels(langue: string, candidat: string, version: string): Promise<Duel[]> {
  const { data, error } = await supabase
    .from("ab_traduction_duels")
    .select(
      "id, post_id, langue, candidat, version, statut, erreur, slides_source, slides_actuel, slides_candidat, hashtags_actuel, hashtags_candidat, vues_actuel, gauche, voie_cta, forme_cta, cta_refus, choix, remarque, created_at",
    )
    .eq("langue", langue)
    .eq("candidat", candidat)
    .eq("version", version)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as Duel[];
}

export async function voterDuel(id: string, choix: ChoixDuel, remarque: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("ab_traduction_duels")
    .update({ choix, remarque: remarque.trim() || null, vote_le: new Date().toISOString(), vote_par: session.user?.id ?? null })
    .eq("id", id);
  if (error) throw error;
}

/** Le côté choisi (gauche ou droite) traduit en version gagnante. */
export function choixDepuisCote(duel: Pick<Duel, "gauche">, cote: "gauche" | "droite" | "egal"): ChoixDuel {
  if (cote === "egal") return "egal";
  const droite = duel.gauche === "actuel" ? "candidat" : "actuel";
  return cote === "gauche" ? duel.gauche : droite;
}

/** Les deux decks dans l'ordre affiché. */
export function decksAffiches(duel: Pick<Duel, "gauche" | "slides_actuel" | "slides_candidat">): [SlideDuel[], SlideDuel[]] {
  return duel.gauche === "actuel"
    ? [duel.slides_actuel, duel.slides_candidat]
    : [duel.slides_candidat, duel.slides_actuel];
}
