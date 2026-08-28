import { estLabelSysteme } from "./mediaCaption";

export type LabelFileSlideshow = {
  slug?: string | null;
  ugc_ai_video?: boolean | null;
};

/** Label UGC AI VIDEO (thématique ou marque système). */
export function estLabelUgcAiVideo(lab: LabelFileSlideshow): boolean {
  return Boolean(lab.ugc_ai_video) || lab.slug === "ugc-ai-video";
}

/**
 * Label que la file Settings / le fallback « moins utilisé » a le droit
 * de poser sur un créateur slideshow. Exclut Hook, la marque `ugc-ai-video`,
 * et tout label coché UGC AI VIDEO (ceux-là = HM vidéo uniquement).
 */
export function estLabelFileSlideshow(lab: LabelFileSlideshow): boolean {
  return !estLabelSysteme(lab) && !estLabelUgcAiVideo(lab);
}

/**
 * Tire le premier item dont le label est éligible slideshow.
 * Les entrées UGC vidéo / système / inconnues en tête sont sautées
 * (retirées de la file, pas assignées).
 */
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
