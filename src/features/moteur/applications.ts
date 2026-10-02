/** Slug canonique de l'application historique. */
export const SLUG_SOPHIA = "sophia";

export interface ApplicationOs {
  id: string;
  slug: string;
  nom: string;
  created_at: string;
}

export function normaliserSlugApplication(valeur: unknown): string {
  return String(valeur ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function estSlugApplicationValide(slug: string): boolean {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(slug);
}

export function estSlugSophia(slug: string | null | undefined): boolean {
  return (slug ?? SLUG_SOPHIA) === SLUG_SOPHIA;
}

export function nomApplication(app: { nom?: string | null; slug?: string | null }): string {
  const nom = String(app.nom ?? "").trim();
  if (nom) return nom;
  const slug = String(app.slug ?? "").trim();
  if (slug === SLUG_SOPHIA) return "Sophia";
  return slug || "—";
}

/** Clé du prompt de pertinence (Sophia garde `pertinence` pour rétrocompat). */
export function clePromptPertinence(slug: string | null | undefined): string {
  return estSlugSophia(slug) ? "pertinence" : `pertinence_${normaliserSlugApplication(slug)}`;
}

/** Clé du prompt de placement (Sophia garde `placement_sophia`). */
export function clePromptPlacement(slug: string | null | undefined): string {
  return estSlugSophia(slug) ? "placement_sophia" : `placement_${normaliserSlugApplication(slug)}`;
}

/**
 * Tranche d'une application dans la file des labels créateurs. Seule la
 * tranche Sophia sert encore (identité d'un compte = Sophia, toujours) : c'est
 * elle que Réglages édite, et elle que lit le bundle figé de manage-users.
 */
export function fileLabelsDeLApplication<T extends { items: unknown[]; par_langue: Record<string, unknown[]> }>(
  file: T & { par_application?: Record<string, { items: T["items"]; par_langue: T["par_langue"] }> },
  slug: string,
): { items: T["items"]; par_langue: T["par_langue"] } {
  const slice = file.par_application?.[slug];
  if (slice) return { items: slice.items ?? [], par_langue: slice.par_langue ?? {} };
  if (estSlugSophia(slug)) return { items: file.items ?? [], par_langue: file.par_langue ?? {} };
  return { items: [] as T["items"], par_langue: {} as T["par_langue"] };
}

/**
 * Réécrit la file d'une application sans toucher aux autres. Pour Sophia, la
 * file « racine » (`items` / `par_langue`, format d'avant les applications)
 * est réécrite aussi : les lecteurs historiques la lisent encore.
 */
export function avecFileLabelsApplication<T extends { items: unknown[]; par_langue: Record<string, unknown[]> }>(
  file: T & { par_application?: Record<string, { items: T["items"]; par_langue: T["par_langue"] }> },
  slug: string,
  slice: { items: T["items"]; par_langue: T["par_langue"] },
): T & { par_application: Record<string, { items: T["items"]; par_langue: T["par_langue"] }> } {
  const par_application = { ...(file.par_application ?? {}) };
  par_application[slug] = slice;
  if (estSlugSophia(slug)) {
    return { ...file, items: slice.items, par_langue: slice.par_langue, par_application };
  }
  return { ...file, par_application };
}
