// Page Slideshows : le tri de la grille et les filtres BLEO, en fonctions pures.
//
// Depuis le 1/11, BLEO assigne les posts : les tris et les filtres lisent ce
// qu'il utilise (valeur, vues moyennes, r moyen, verdict, état), plus le tier.

import type { EtatBleo, InfosBleoContenu, VerdictContenu } from "@/features/bleo/api";

/** Les tris de la grille, dans l'ordre des boutons ; « valeur » est celui par défaut. */
export const TRIS_SLIDESHOWS = ["valeur", "vues", "r", "recent", "posts", "compte"] as const;
export type TriSlideshow = (typeof TRIS_SLIDESHOWS)[number];

/** « tous » laisse tout passer, slideshows hors BLEO compris. */
export type FiltreVerdictBleo = "tous" | VerdictContenu;
export type FiltreEtatBleo = "tous" | EtatBleo;

/** Ce dont le tri a besoin d'un slideshow. */
export interface SlideshowTriable {
  id: string;
  created_at: string;
  nb_posts?: number;
  compte_reference_id: string | null;
}

/** Ce dont les tris et les filtres ont besoin de sa ligne BLEO. */
export type InfosBleoTri = Pick<InfosBleoContenu, "verdict" | "etat_bleo" | "valeur_max" | "vues_moyenne" | "r_moyen">;

/** Le @ du compte source, sans « @ » ; vide sans compte. */
export function handleDuContenu(
  c: Pick<SlideshowTriable, "compte_reference_id">,
  handleParId: ReadonlyMap<string, string>,
): string {
  if (!c.compte_reference_id) return "";
  return handleParId.get(c.compte_reference_id) ?? "";
}

/** Les slideshows au verdict et à l'état BLEO choisis. Un filtre posé écarte ceux hors BLEO. */
export function filtrerParBleo<C extends { id: string }>(
  liste: readonly C[],
  filtres: { verdict: FiltreVerdictBleo; etat: FiltreEtatBleo },
  bleoParId: ReadonlyMap<string, Pick<InfosBleoTri, "verdict" | "etat_bleo">>,
): C[] {
  if (filtres.verdict === "tous" && filtres.etat === "tous") return [...liste];
  return liste.filter((c) => {
    const b = bleoParId.get(c.id);
    if (!b) return false;
    if (filtres.verdict !== "tous" && b.verdict !== filtres.verdict) return false;
    if (filtres.etat !== "tous" && b.etat_bleo !== filtres.etat) return false;
    return true;
  });
}

const chiffre = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) ? v : null;

/** Du plus grand au plus petit ; sans chiffre (ou hors BLEO), en dernier. */
function decroissant(a: number | null | undefined, b: number | null | undefined): number {
  const va = chiffre(a);
  const vb = chiffre(b);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  return vb - va;
}

/**
 * Le tri de la grille. Les tris BLEO (valeur, vues moyennes, r moyen) sont
 * décroissants, les slideshows sans chiffre en dernier ; à égalité, le plus
 * récent d'abord, comme pour les autres tris.
 */
export function trierSlideshows<C extends SlideshowTriable>(
  liste: readonly C[],
  tri: TriSlideshow,
  ctx: {
    handleParId: ReadonlyMap<string, string>;
    bleoParId: ReadonlyMap<string, InfosBleoTri>;
  },
): C[] {
  const arr = [...liste];
  const parDate = (a: C, b: C) => b.created_at.localeCompare(a.created_at);
  const parBleo = (cle: "valeur_max" | "vues_moyenne" | "r_moyen") => (a: C, b: C) => {
    const diff = decroissant(ctx.bleoParId.get(a.id)?.[cle], ctx.bleoParId.get(b.id)?.[cle]);
    return diff !== 0 ? diff : parDate(a, b);
  };
  switch (tri) {
    case "valeur":
      return arr.sort(parBleo("valeur_max"));
    case "vues":
      return arr.sort(parBleo("vues_moyenne"));
    case "r":
      return arr.sort(parBleo("r_moyen"));
    case "posts":
      return arr.sort((a, b) => {
        const diff = (b.nb_posts ?? 0) - (a.nb_posts ?? 0);
        return diff !== 0 ? diff : parDate(a, b);
      });
    case "compte":
      return arr.sort((a, b) => {
        const ha = handleDuContenu(a, ctx.handleParId);
        const hb = handleDuContenu(b, ctx.handleParId);
        const cmp = ha.localeCompare(hb, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        if (!a.compte_reference_id && b.compte_reference_id) return 1;
        if (a.compte_reference_id && !b.compte_reference_id) return -1;
        return parDate(a, b);
      });
    default:
      return arr.sort(parDate);
  }
}
