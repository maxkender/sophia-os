/** Même règle que `src/features/moteur/fileLabelsSlideshow.ts`. */

export const SLUG_HOOK = "hook";
export const SLUG_UGC_AI_VIDEO = "ugc-ai-video";

export type LabelFileSlideshow = {
  id?: string;
  slug?: string | null;
  ugc_ai_video?: boolean | null;
};

export function estLabelSysteme(lab: LabelFileSlideshow): boolean {
  const slug = lab.slug ?? "";
  return slug === SLUG_UGC_AI_VIDEO || slug === SLUG_HOOK;
}

export function estLabelUgcAiVideo(lab: LabelFileSlideshow): boolean {
  return Boolean(lab.ugc_ai_video) || lab.slug === SLUG_UGC_AI_VIDEO;
}

/** File Settings / fallback least-used : slideshow only, jamais UGC AI VIDEO. */
export function estLabelFileSlideshow(lab: LabelFileSlideshow): boolean {
  return !estLabelSysteme(lab) && !estLabelUgcAiVideo(lab);
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
