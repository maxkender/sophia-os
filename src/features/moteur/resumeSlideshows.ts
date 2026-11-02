// Page Slideshows : les chiffres du haut et la répartition BLEO (verdicts, états).

import type { EtatBleo, InfosBleoContenu, VerdictContenu } from "@/features/bleo/api";
import { ETATS_BLEO, VERDICTS_CONTENU } from "@/features/bleo/format";

import type { StatsCompteSlideshows } from "./statsSlideshowsCompte";

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

export interface RepartitionBleo {
  /** Combien de slideshows à chaque verdict, de gagnant à non gagnant. */
  verdicts: Record<VerdictContenu, number>;
  /** Combien à chaque état : à juger, en test, jugé. */
  etats: Record<EtatBleo, number>;
  /** Slideshows sans ligne BLEO : rattachés à aucune famille. */
  horsBleo: number;
}

/**
 * La répartition BLEO des slideshows affichés : une entrée par slideshow, sa
 * ligne BLEO ou `null` s'il n'est pas dans BLEO. Un verdict ou un état vide
 * (ou inconnu) ne compte pas dans sa barre.
 */
export function repartitionBleo(
  lignes: ReadonlyArray<Pick<InfosBleoContenu, "verdict" | "etat_bleo"> | null | undefined>,
): RepartitionBleo {
  const verdicts = Object.fromEntries(VERDICTS_CONTENU.map((v) => [v, 0])) as Record<VerdictContenu, number>;
  const etats = Object.fromEntries(ETATS_BLEO.map((e) => [e, 0])) as Record<EtatBleo, number>;
  let horsBleo = 0;
  for (const l of lignes) {
    if (!l) {
      horsBleo += 1;
      continue;
    }
    if (l.verdict && l.verdict in verdicts) verdicts[l.verdict] += 1;
    if (l.etat_bleo && l.etat_bleo in etats) etats[l.etat_bleo] += 1;
  }
  return { verdicts, etats, horsBleo };
}
