/** Même règle que `src/features/moteur/fileLabelsSlideshow.ts`. */

export const SLUG_HOOK = "hook";

export type LabelFileSlideshow = {
  id?: string;
  slug?: string | null;
  nom?: string | null;
  /** Label manuel (UGCV…) : jamais tiré, posé à la main par l'admin (migration 0661). */
  manuel?: boolean | null;
};

function slugLabel(lab: LabelFileSlideshow): string {
  return (lab.slug ?? "").trim().toLowerCase();
}

function nomLabel(lab: LabelFileSlideshow): string {
  return (lab.nom ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function estLabelSysteme(lab: LabelFileSlideshow): boolean {
  return slugLabel(lab) === SLUG_HOOK || nomLabel(lab) === "hook";
}

/** Label manuel (UGCV…) : aucun tirage ne le pose, seul l'admin le met sur un compte. */
export function estLabelManuel(lab: LabelFileSlideshow): boolean {
  return Boolean(lab.manuel);
}

/** File Settings / fallback least-used : slideshow only, jamais un label manuel. */
export function estLabelFileSlideshow(lab: LabelFileSlideshow): boolean {
  return !estLabelSysteme(lab) && !estLabelManuel(lab);
}

/** Hook : jamais sur un compte. */
export function estLabelInterditCompte(lab: LabelFileSlideshow): boolean {
  return estLabelSysteme(lab);
}

export function consommerFileSlideshow<T extends { label_id: string }>(
  items: T[],
  eligibleIds: Iterable<string>,
): { item: T | null; rest: T[]; skipped: T[] } {
  const ok = new Set([...eligibleIds].filter(Boolean));
  const skipped: T[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]!;
    if (ok.has(it.label_id)) {
      return { item: it, rest: items.slice(i + 1), skipped };
    }
    skipped.push(it);
  }
  return { item: null, rest: [], skipped };
}
