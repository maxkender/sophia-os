// Page Slideshows : les chiffres du haut et la répartition des rangs.

import type { StatsCompteSlideshows } from "./statsSlideshowsCompte";
import { TIERS, type Tier } from "./types";

export interface TotauxSlideshows {
  importes: number;
  gardes: number;
  rejetes: number;
  encours: number;
  /** Part des importés gardés, en % entier ; null sans import. */
  partGardes: number | null;
}

/** Les totaux de tous les comptes (orphelins compris). */
export function totauxSlideshows(stats: StatsCompteSlideshows[]): TotauxSlideshows {
  const t = stats.reduce(
    (acc, s) => ({
      importes: acc.importes + s.importes,
      gardes: acc.gardes + s.gardes,
      rejetes: acc.rejetes + s.rejetes,
      encours: acc.encours + s.encours,
    }),
    { importes: 0, gardes: 0, rejetes: 0, encours: 0 },
  );
  return { ...t, partGardes: t.importes ? Math.round((100 * t.gardes) / t.importes) : null };
}

/** Combien de slideshows à chaque rang, de D à S+ (les rangs inconnus ne comptent pas). */
export function repartitionTiers(contenus: ReadonlyArray<{ tier: Tier }>): Record<Tier, number> {
  const n = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  for (const c of contenus) if (c.tier in n) n[c.tier] += 1;
  return n;
}
