import { supabase } from "@/lib/supabase/client";

/**
 * Les propositions de sources (0684) : des comptes TikTok trouvés par l'agent
 * éclaireur, qu'un admin valide ou refuse sur la page Sources. Valider crée la
 * source et la met dans la file des mises à jour, une source à la fois.
 */

/** `ecarte` (0685) existe en base : un compte que l'agent a relevé puis laissé de côté. La page ne le lit pas. */
export type StatutCandidat = "propose" | "plus_tard" | "valide" | "refuse";
/** `label` : nourrit un label existant. `concept` : un format qu'on n'a pas. */
export type SorteCandidat = "label" | "concept";

export interface ExempleCandidat {
  url: string;
  vues: number | null;
  accroche: string;
}

export interface ChiffresCandidat {
  /** Derniers posts relevés, slideshows ou non. */
  posts: number | null;
  /** Slideshows parmi eux : les vues ne portent que sur eux. */
  slideshows: number | null;
  vuesMediane: number | null;
  vuesMax: number | null;
  posts10k: number | null;
  posts100k: number | null;
  abonnes: number | null;
  /** Posts du compte en tout, d'après son profil. */
  postsTotal: number | null;
  /** Jour du dernier slideshow (AAAA-MM-JJ). */
  dernierSlideshow: string | null;
  /** Jour du relevé (AAAA-MM-JJ). */
  releveLe: string | null;
}

export interface CandidatSource {
  id: string;
  handle: string;
  langue: string;
  sorte: SorteCandidat;
  labelId: string | null;
  concept: string | null;
  pourquoi: string;
  risques: string | null;
  score: number;
  chiffres: ChiffresCandidat;
  exemples: ExempleCandidat[];
  piste: string;
  statut: StatutCandidat;
  raisonRefus: string | null;
}

const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Une ligne de `sources_candidats` telle que la page la lit. */
export function versCandidat(l: Record<string, unknown>): CandidatSource {
  const c = (l.chiffres ?? {}) as Record<string, unknown>;
  const exemples = Array.isArray(l.exemples) ? (l.exemples as Record<string, unknown>[]) : [];
  return {
    id: String(l.id),
    handle: String(l.handle_tiktok),
    langue: String(l.langue),
    sorte: l.sorte === "concept" ? "concept" : "label",
    labelId: texte(l.label_id),
    concept: texte(l.concept),
    pourquoi: String(l.pourquoi ?? ""),
    risques: texte(l.risques),
    score: nombre(l.score) ?? 0,
    chiffres: {
      posts: nombre(c.posts),
      // Un relevé sans détail ne compte que des slideshows.
      slideshows: nombre(c.slideshows) ?? nombre(c.posts),
      vuesMediane: nombre(c.vues_mediane),
      vuesMax: nombre(c.vues_max),
      posts10k: nombre(c.posts_10k),
      posts100k: nombre(c.posts_100k),
      abonnes: nombre(c.abonnes),
      postsTotal: nombre(c.posts_total),
      dernierSlideshow: texte(c.dernier_slideshow),
      releveLe: texte(c.releve_le),
    },
    exemples: exemples
      .filter((e) => texte(e.url))
      .map((e) => ({ url: String(e.url), vues: nombre(e.vues), accroche: String(e.accroche ?? "") })),
    piste: String(l.piste ?? ""),
    statut: (["propose", "plus_tard", "valide", "refuse"] as const).includes(l.statut as StatutCandidat)
      ? (l.statut as StatutCandidat)
      : "propose",
    raisonRefus: texte(l.raison_refus),
  };
}

export type OngletCandidats = "a_decider" | "plus_tard" | "decides";

const STATUTS_ONGLET: Record<OngletCandidats, StatutCandidat[]> = {
  a_decider: ["propose"],
  plus_tard: ["plus_tard"],
  decides: ["valide", "refuse"],
};

export interface FiltreCandidats {
  onglet: OngletCandidats;
  /** Code de langue, ou "" pour toutes. */
  langue: string;
  /** Une sorte, ou "" pour les deux. */
  sorte: SorteCandidat | "";
}

/** Les propositions d'un onglet, filtrées, le meilleur score d'abord. */
export function candidatsVisibles(tous: CandidatSource[], filtre: FiltreCandidats): CandidatSource[] {
  return tous
    .filter(
      (c) =>
        STATUTS_ONGLET[filtre.onglet].includes(c.statut) &&
        (!filtre.langue || c.langue === filtre.langue) &&
        (!filtre.sorte || c.sorte === filtre.sorte),
    )
    .sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle));
}

export function compterOnglets(tous: CandidatSource[]): Record<OngletCandidats, number> {
  const n = (o: OngletCandidats) => tous.filter((c) => STATUTS_ONGLET[o].includes(c.statut)).length;
  return { a_decider: n("a_decider"), plus_tard: n("plus_tard"), decides: n("decides") };
}

/** Les langues présentes dans un onglet, dans l'ordre du nombre de propositions. */
export function languesDeLOnglet(tous: CandidatSource[], onglet: OngletCandidats): string[] {
  const compte = new Map<string, number>();
  for (const c of tous) {
    if (STATUTS_ONGLET[onglet].includes(c.statut)) compte.set(c.langue, (compte.get(c.langue) ?? 0) + 1);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
}

/** 1 234 567 → « 1,2 M », 84 800 → « 85 k » : assez pour comparer deux comptes. */
export function vuesCourtes(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)} k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",").replace(",0", "")} k`;
  return String(n);
}

// --- Base -------------------------------------------------------------------

export async function listerCandidatsSources(): Promise<CandidatSource[]> {
  const { data, error } = await supabase
    .from("sources_candidats")
    .select(
      "id, handle_tiktok, langue, sorte, label_id, concept, pourquoi, risques, score, chiffres, exemples, piste, statut, raison_refus",
    )
    // Les comptes écartés par l'agent restent en base pour sa mémoire, pas pour la page.
    .neq("statut", "ecarte")
    .order("score", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l) => versCandidat(l as Record<string, unknown>));
}

/** Crée la source, pose son label et la met dans la file des mises à jour. */
export async function validerCandidatSource(
  id: string,
  labelId: string,
  langue: string,
): Promise<{ handle: string; file: "lancee" | "attente" }> {
  const { data, error } = await supabase.rpc("sources_candidats_valider", {
    p_id: id,
    p_label: labelId,
    p_langue: langue,
  });
  if (error) throw error;
  const r = (data ?? {}) as { handle?: string; file?: string };
  return { handle: r.handle ?? "", file: r.file === "lancee" ? "lancee" : "attente" };
}

export async function deciderCandidatSource(
  id: string,
  statut: "refuse" | "plus_tard" | "propose",
  raison?: string,
): Promise<void> {
  const { error } = await supabase.rpc("sources_candidats_decider", {
    p_id: id,
    p_statut: statut,
    p_raison: raison ?? null,
  });
  if (error) throw error;
}
