// A/B de la traduction et du placement (migration 0620, fonction `ab-traduction`),
// dans Tests seulement : les duels à l'aveugle. Un slideshow déjà publié, son
// deck parti (`actuel`) contre celui d'un nouveau circuit (`candidat`), montrés
// à gauche ou à droite au hasard. Rien ne part en production.

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
  /** Envoyé aux relecteurs natifs de la langue (0626) ; null : l'admin seul le voit. */
  relecteurs_le: string | null;
  created_at: string;
}

/** Le vote d'un relecteur natif sur un duel (0626), vu par l'admin. */
export interface VoteRelecteur {
  id: string;
  duel_id: string;
  profile_id: string;
  choix: ChoixDuel;
  note_actuel: number | null;
  note_candidat: number | null;
  remarque: string | null;
  remarque_sur: "actuel" | "candidat" | "les_deux" | null;
  type_erreur: string | null;
  updated_at: string;
}

/** Le décompte des votes des relecteurs, par langue × candidat × version (0626). */
export interface RapportVotes {
  langue: string;
  candidat: string;
  version: string;
  duels_envoyes: number;
  duels_votes: number;
  votes: number;
  relecteurs: number;
  candidat_gagne: number;
  actuel_gagne: number;
  egal: number;
  /** Part du candidat sur les duels tranchés (hors égalités) ; null sans vote tranché. */
  part_candidat: number | null;
  note_actuel: number | null;
  note_candidat: number | null;
  types_erreur: Record<string, number>;
  remarques: Array<{ remarque: string; sur: string | null; type: string | null; le: string }>;
}

/** Règle D8 (docs/bleo.md) : une version n'est retenue qu'à partir de 55 % des duels tranchés. */
export const SEUIL_RETENUE = 0.55;

export interface CircuitAb {
  id: string;
  version: string;
  nom: string;
  applications: string[] | null;
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

export async function listerDuels(langue: string, candidat: string, version: string): Promise<Duel[]> {
  const { data, error } = await supabase
    .from("ab_traduction_duels")
    .select(
      "id, post_id, langue, candidat, version, statut, erreur, slides_source, slides_actuel, slides_candidat, hashtags_actuel, hashtags_candidat, vues_actuel, gauche, voie_cta, forme_cta, cta_refus, choix, remarque, relecteurs_le, created_at",
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

// ---------------------------------------------------------------------------
// Les relecteurs natifs (0626)
// ---------------------------------------------------------------------------

/** Envoie des duels aux relecteurs natifs de leur langue, ou les retire. */
export async function envoyerAuxRelecteurs(ids: string[], envoyer: boolean): Promise<void> {
  if (!ids.length) return;
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("ab_traduction_duels")
    .update(
      envoyer
        ? { relecteurs_le: new Date().toISOString(), relecteurs_par: session.user?.id ?? null }
        : { relecteurs_le: null, relecteurs_par: null },
    )
    .in("id", ids);
  if (error) throw error;
}

/** Les votes des relecteurs sur ces duels (RLS admin). */
export async function listerVotesRelecteurs(duelIds: string[]): Promise<VoteRelecteur[]> {
  if (!duelIds.length) return [];
  const { data, error } = await supabase
    .from("ab_traduction_votes")
    .select("id, duel_id, profile_id, choix, note_actuel, note_candidat, remarque, remarque_sur, type_erreur, updated_at")
    .in("duel_id", duelIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VoteRelecteur[];
}

export async function rapportVotesRelecteurs(langue: string): Promise<RapportVotes[]> {
  const { data, error } = await supabase.rpc("ab_traduction_votes_rapport", { p_langue: langue });
  if (error) throw error;
  return ((data ?? []) as RapportVotes[]).map((r) => ({
    ...r,
    types_erreur: r.types_erreur ?? {},
    remarques: r.remarques ?? [],
  }));
}

/** Le décompte des votes d'un duel : combien pour chaque version, et les notes moyennes. */
export function decompteVotes(votes: ReadonlyArray<Pick<VoteRelecteur, "choix" | "note_actuel" | "note_candidat">>) {
  const n = (c: ChoixDuel) => votes.filter((v) => v.choix === c).length;
  const moyenne = (cle: "note_actuel" | "note_candidat") => {
    const notes = votes.map((v) => v[cle]).filter((x): x is number => x != null);
    return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
  };
  return {
    votes: votes.length,
    candidat: n("candidat"),
    actuel: n("actuel"),
    egal: n("egal"),
    noteActuel: moyenne("note_actuel"),
    noteCandidat: moyenne("note_candidat"),
  };
}

/** Verdict de la règle D8 sur un rapport : retenu, écarté, ou pas assez de votes tranchés. */
export function verdictCandidat(r: Pick<RapportVotes, "part_candidat" | "candidat_gagne" | "actuel_gagne">, minimum = 10): "retenu" | "ecarte" | "insuffisant" {
  if (r.part_candidat == null || r.candidat_gagne + r.actuel_gagne < minimum) return "insuffisant";
  return r.part_candidat >= SEUIL_RETENUE ? "retenu" : "ecarte";
}
