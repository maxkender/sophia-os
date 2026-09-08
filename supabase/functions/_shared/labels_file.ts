/** Même règle que `src/features/moteur/fileLabelsSlideshow.ts`. */

export const SLUG_HOOK = "hook";
export const SLUG_UGC_AI_VIDEO = "ugc-ai-video";

export type LabelFileSlideshow = {
  id?: string;
  slug?: string | null;
  nom?: string | null;
  ugc_ai_video?: boolean | null;
};

function slugLabel(lab: LabelFileSlideshow): string {
  return (lab.slug ?? "").trim().toLowerCase();
}

function nomLabel(lab: LabelFileSlideshow): string {
  return (lab.nom ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function estLabelSysteme(lab: LabelFileSlideshow): boolean {
  const slug = slugLabel(lab);
  const nom = nomLabel(lab);
  return (
    slug === SLUG_UGC_AI_VIDEO ||
    slug === SLUG_HOOK ||
    nom === "hook" ||
    nom === "ugc ai video"
  );
}

export function estLabelUgcAiVideo(lab: LabelFileSlideshow): boolean {
  return Boolean(lab.ugc_ai_video) ||
    slugLabel(lab) === SLUG_UGC_AI_VIDEO ||
    nomLabel(lab) === "ugc ai video";
}

/** File Settings / fallback least-used : slideshow only, jamais UGC AI VIDEO. */
export function estLabelFileSlideshow(lab: LabelFileSlideshow): boolean {
  return !estLabelSysteme(lab) && !estLabelUgcAiVideo(lab);
}

/** Hook / marque système : jamais sur un compte, même UGC AI VIDEO. */
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
