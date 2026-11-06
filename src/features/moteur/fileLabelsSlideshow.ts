import { estLabelSysteme } from "./mediaCaption";

export type LabelFileSlideshow = {
  id?: string;
  slug?: string | null;
  nom?: string | null;
  /** Label manuel (UGCV…) : jamais tiré, posé à la main par l'admin (migration 0661). */
  manuel?: boolean | null;
};

/** Label manuel (UGCV…) : aucun tirage ne le pose, seul l'admin le met sur un compte. */
export function estLabelManuel(lab: LabelFileSlideshow): boolean {
  return Boolean(lab.manuel);
}

/**
 * Label que la file Settings / le fallback « moins utilisé » a le droit
 * de poser sur un créateur slideshow. Exclut Hook et tout label manuel
 * (UGCV : l'admin seul le pose).
 */
export function estLabelFileSlideshow(lab: LabelFileSlideshow): boolean {
  return !estLabelSysteme(lab) && !estLabelManuel(lab);
}

/**
 * Labels proposés pour un compte : les labels slideshow, plus les labels
 * manuels pour l'admin seul. Rien tant que le compte porte un label manuel
 * (il est exclusif : on le retire d'abord).
 */
export function labelsProposesCompte<T extends LabelFileSlideshow & { id: string }>(
  tous: readonly T[],
  actifs: readonly (LabelFileSlideshow & { id: string })[],
  admin: boolean,
): T[] {
  if (actifs.some((l) => estLabelManuel(l))) return [];
  const pris = new Set(actifs.map((l) => l.id));
  return tous.filter((l) => !pris.has(l.id) && (estLabelFileSlideshow(l) || (admin && estLabelManuel(l))));
}

/** Labels du compte après l'ajout de `label` : un label manuel remplace tous les autres. */
export function labelsApresAjout(ids: readonly string[], label: LabelFileSlideshow & { id: string }): string[] {
  return estLabelManuel(label) ? [label.id] : [...new Set([...ids, label.id])];
}

/** Hook : jamais sur un compte. */
export function estLabelInterditCompte(lab: LabelFileSlideshow): boolean {
  return estLabelSysteme(lab);
}

/**
 * Tire le premier item dont le label est éligible slideshow.
 * Les entrées manuelles / système / inconnues en tête sont sautées
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
