// Page Sources : les comptes de référence groupés (principal + conjoints) et
// les chiffres du haut de page.
//
// Plus de colonne « Stock » (25/10) : elle comptait les sujets reproductibles,
// un pipeline à l'arrêt depuis le 29/07, et affichait 0 partout. La page ne
// montre que la date de la dernière extraction.

import type { CompteReference } from "./types";

export interface GroupeSource {
  principal: CompteReference;
  conjoints: CompteReference[];
}

/** Un groupe par compte principal. Les actifs d'abord, puis par @. */
export function groupesSources(sources: CompteReference[]): GroupeSource[] {
  const principaux = sources.filter((s) => !s.parent_id);
  return principaux
    .map((principal) => ({ principal, conjoints: sources.filter((s) => s.parent_id === principal.id) }))
    .sort(
      (a, b) =>
        Number(b.principal.is_active) - Number(a.principal.is_active) ||
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
  jamaisExtraites: number;
  /** La dernière extraction, toutes sources confondues. */
  derniereExtraction: string | null;
}

/** Les chiffres du haut : sur les groupes actifs seulement. */
export function resumeSources(groupes: GroupeSource[]): ResumeSources {
  const actifs = groupes.filter((g) => g.principal.is_active);
  const toutes = groupes.flatMap((g) => [g.principal, ...g.conjoints]);
  const dates = toutes.map((s) => s.dernier_scrape_at).filter((d): d is string => Boolean(d)).sort();
  return {
    actives: actifs.length,
    total: groupes.length,
    conjoints: groupes.reduce((n, g) => n + g.conjoints.length, 0),
    jamaisExtraites: actifs.filter((g) => !g.principal.dernier_scrape_at).length,
    derniereExtraction: dates[dates.length - 1] ?? null,
  };
}
