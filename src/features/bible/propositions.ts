/**
 * 19/11 (Adrien) : « Propositions », le premier onglet de la Bible. Ce sont les comptes que l'agent éclaireur
 * trouve chaque jour (`sources_candidats`, 0684), ceux à décider comme ceux mis à plus tard, rangés par jour.
 * De là, un compte passe dans « À importer » ou directement dans « Prochain batch » (0766) : il devient un compte
 * de la Bible, sous la carte de son label, et suit le chemin comme les autres.
 */
import { type CandidatSource, deciderCandidatSource, versCandidat } from "@/features/moteur/candidatsSources";
import { supabase } from "@/lib/supabase/client";

import type { EtapeManuelle, Section } from "./moodboard";

export interface Proposition extends CandidatSource {
  /** Quand l'agent l'a déposée. */
  creeLe: string;
  /** Le nom du label proposé (ou du plus proche, pour un concept). */
  labelNom: string | null;
}

export async function lirePropositions(): Promise<Proposition[]> {
  const { data, error } = await supabase
    .from("sources_candidats")
    .select("id, handle_tiktok, langue, sorte, label_id, concept, pourquoi, risques, score, chiffres, exemples, piste, statut, raison_refus, note, created_at, labels(nom)")
    .in("statut", ["propose", "plus_tard"])
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as (Record<string, unknown> & { created_at: string; labels: { nom: string } | null })[])
    .map((l) => ({ ...versCandidat(l), creeLe: l.created_at, labelNom: l.labels?.nom ?? null }));
}

/**
 * La proposition devient un compte de la Bible, à l'étape demandée. Rend l'id du compte (pour ses miniatures).
 * `carte` absent : sous le label que l'agent proposait (un concept arrive sans label). `carte` donné : c'est le bloc
 * que l'admin a choisi (`null` : sans label), 0768.
 */
export async function passerDansLaBible(id: string, etape: EtapeManuelle, carte?: { id: string } | null): Promise<{ bibleId: string; handle: string; deja: boolean }> {
  const { data, error } = await supabase.rpc(
    "sources_candidats_vers_bible",
    carte === undefined ? { p_id: id, p_etape: etape } : { p_id: id, p_etape: etape, p_carte: carte?.id ?? null, p_choisir: true },
  );
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { bible_id?: string; handle?: string; deja?: boolean };
  return { bibleId: r.bible_id ?? "", handle: r.handle ?? "", deja: Boolean(r.deja) };
}

/** Plus tard, remettre à décider, ou refuser avec la raison (l'agent éclaireur la relit). */
export async function deciderProposition(id: string, statut: "plus_tard" | "propose" | "refuse", raison?: string): Promise<void> {
  try {
    await deciderCandidatSource(id, statut, raison);
  } catch (e) {
    throw new Error((e as { message?: string }).message ?? "La décision n'a pas pu être enregistrée.");
  }
}

const JOUR_PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });

/** Le jour (heure de Paris) où l'agent a déposé la proposition : « 2026-11-19 ». */
export function jourDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : JOUR_PARIS.format(d);
}

/** « jeudi 19 novembre ». */
export function jourEnLettres(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? jour : JOUR_LONG.format(d);
}

export type FiltreStatut = "toutes" | "a_decider" | "plus_tard";

export const compterPropositions = (tous: Proposition[]): { toutes: number; a_decider: number; plus_tard: number } => ({
  toutes: tous.length,
  a_decider: tous.filter((p) => p.statut === "propose").length,
  plus_tard: tous.filter((p) => p.statut === "plus_tard").length,
});

/**
 * Les propositions rangées par jour, le plus récent d'abord, et dans un jour le meilleur score d'abord.
 * `sectionDe` donne l'app d'un label (filtre « app ») ; un concept sans label n'a pas d'app.
 */
export function rangerPropositions(
  tous: Proposition[],
  filtre: { statut: FiltreStatut; recherche: string; section: Section | "sans" | "" },
  sectionDe: (labelId: string) => Section,
): { jour: string; propositions: Proposition[] }[] {
  const q = filtre.recherche.trim().toLowerCase().replace(/^@/, "");
  const sectionDeLa = (p: Proposition): Section | "sans" => (p.sorte === "label" && p.labelId ? sectionDe(p.labelId) : "sans");
  const visibles = tous.filter((p) =>
    (filtre.statut === "toutes" || (filtre.statut === "plus_tard" ? p.statut === "plus_tard" : p.statut === "propose"))
    && (!filtre.section || sectionDeLa(p) === filtre.section)
    && (!q || p.handle.includes(q) || (p.labelNom ?? "").toLowerCase().includes(q) || (p.concept ?? "").toLowerCase().includes(q)));
  const parJour = new Map<string, Proposition[]>();
  for (const p of visibles) {
    const j = jourDe(p.creeLe);
    parJour.set(j, [...(parJour.get(j) ?? []), p]);
  }
  return [...parJour.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([jour, propositions]) => ({ jour, propositions: propositions.sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle)) }));
}
