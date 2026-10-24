// Page Sources : les comptes de référence groupés (principal + conjoints),
// leur stock, et les chiffres du haut de page.

import type { CompteReference } from "./types";

/** Sous ce stock (slideshows prêts), la source s'essouffle : il faut un conjoint. */
export const SEUIL_STOCK_SOURCE = 10;

export interface GroupeSource {
  principal: CompteReference;
  conjoints: CompteReference[];
  /** Le stock du principal et de ses conjoints. */
  stock: number;
}

export type EtatStock = "epuise" | "faible" | "ok";

export function etatStock(stock: number): EtatStock {
  if (stock === 0) return "epuise";
  return stock < SEUIL_STOCK_SOURCE ? "faible" : "ok";
}

/**
 * Un groupe par compte principal. Les actifs d'abord, et parmi eux les stocks
 * les plus bas en tête : ce qui demande une action se voit sans défiler.
 */
export function groupesSources(sources: CompteReference[], stock: Record<string, number>): GroupeSource[] {
  const principaux = sources.filter((s) => !s.parent_id);
  return principaux
    .map((principal) => {
      const conjoints = sources.filter((s) => s.parent_id === principal.id);
      return {
        principal,
        conjoints,
        stock: (stock[principal.id] ?? 0) + conjoints.reduce((n, c) => n + (stock[c.id] ?? 0), 0),
      };
    })
    .sort(
      (a, b) =>
        Number(b.principal.is_active) - Number(a.principal.is_active) ||
        a.stock - b.stock ||
        a.principal.handle_tiktok.localeCompare(b.principal.handle_tiktok),
    );
}

/** Le filtre du tableau : le @compte (principal ou conjoint), la niche ou la langue. */
export function filtrerGroupes(groupes: GroupeSource[], recherche: string): GroupeSource[] {
  const q = recherche.trim().toLowerCase().replace(/^@/, "");
  if (!q) return groupes;
  return groupes.filter((g) =>
    [g.principal, ...g.conjoints].some(
      (s) =>
        s.handle_tiktok.toLowerCase().includes(q) ||
        (s.niche ?? "").toLowerCase().includes(q) ||
        s.langue.toLowerCase() === q,
    ),
  );
}

export interface ResumeSources {
  actives: number;
  total: number;
  conjoints: number;
  stock: number;
  epuisees: number;
  faibles: number;
  jamaisExtraites: number;
  /** La dernière extraction, toutes sources confondues. */
  derniereExtraction: string | null;
}

/** Les chiffres du haut : sur les groupes actifs seulement, une source éteinte ne manque de rien. */
export function resumeSources(groupes: GroupeSource[]): ResumeSources {
  const actifs = groupes.filter((g) => g.principal.is_active);
  const toutes = groupes.flatMap((g) => [g.principal, ...g.conjoints]);
  const dates = toutes.map((s) => s.dernier_scrape_at).filter((d): d is string => Boolean(d)).sort();
  return {
    actives: actifs.length,
    total: groupes.length,
    conjoints: groupes.reduce((n, g) => n + g.conjoints.length, 0),
    stock: actifs.reduce((n, g) => n + g.stock, 0),
    epuisees: actifs.filter((g) => etatStock(g.stock) === "epuise").length,
    faibles: actifs.filter((g) => etatStock(g.stock) === "faible").length,
    jamaisExtraites: actifs.filter((g) => !g.principal.dernier_scrape_at).length,
    derniereExtraction: dates[dates.length - 1] ?? null,
  };
}
