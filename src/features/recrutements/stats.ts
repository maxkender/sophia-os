import {
  JOURS_STATS,
  SEUIL_RATIO_POSTS,
  TARIF_CREATEUR_ESSAI_USD,
  TARIF_CREATEUR_MOIS_USD,
  TZ_STATS,
} from "./constantes";
import type { StatsCreateur10j } from "./types";

/** YYYY-MM-DD du calendrier Paris. */
export function jourParis(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ_STATS });
}

export function jourParisIso(iso: string): string {
  return jourParis(new Date(iso));
}

/** Aujourd'hui Paris + les (n-1) jours précédents, du plus ancien au plus récent. */
export function derniersJoursParis(n = JOURS_STATS, maintenant = new Date()): string[] {
  const jours: string[] = [];
  const iso = jourParis(maintenant);
  const [y, m, d] = iso.split("-").map(Number);
  const ancre = Date.UTC(y, m - 1, d);
  for (let i = n - 1; i >= 0; i -= 1) {
    const t = new Date(ancre - i * 86_400_000);
    const aa = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
    const jj = String(t.getUTCDate()).padStart(2, "0");
    jours.push(`${aa}-${mm}-${jj}`);
  }
  return jours;
}

export function ratioPosts(postes: number, prevus: number): number | null {
  if (prevus <= 0) return null;
  return postes / prevus;
}

export function flagVolume(postes: number, prevus: number, seuil = SEUIL_RATIO_POSTS): boolean {
  const r = ratioPosts(postes, prevus);
  if (r == null) return false;
  return r < seuil;
}

/** Payé sur 10 j : essai 15 $ si encore en semaine d'essai, sinon 60 $/mois prorata. */
export function paye10jUsd(opts: {
  coutMensuel: number | null;
  essai: boolean;
}): number {
  if (opts.essai) return TARIF_CREATEUR_ESSAI_USD;
  const mensuel =
    opts.coutMensuel != null && opts.coutMensuel > 0
      ? opts.coutMensuel
      : TARIF_CREATEUR_MOIS_USD;
  return (mensuel * JOURS_STATS) / 30;
}

export function usdPour1000(payeUsd: number, vues: number): number | null {
  if (vues <= 0) return null;
  return payeUsd / (vues / 1000);
}

/**
 * Mix déterministe + nuance vues :
 * - volume < 75 % → flag
 * - 0 vue malgré des posts → ton « vues » (warmup/shadowban)
 * - sous-quota mais grosses vues → ton doux
 */
export function tonFlag(opts: {
  flagVolume: boolean;
  postes: number;
  vuesMoy10: number | null;
  vues10j: number;
}): StatsCreateur10j["ton"] {
  if (!opts.flagVolume) return "ok";
  if (opts.postes > 0 && (opts.vues10j === 0 || opts.vuesMoy10 === 0)) return "vues";
  if (opts.vuesMoy10 != null && opts.vuesMoy10 >= 5_000) return "doux";
  return "volume";
}

export function assemblerStatsCreateur(input: {
  posterId: string;
  prevus: number;
  postes: number;
  vuesMoy10: number | null;
  vues10j: number;
  coutMensuel: number | null;
  essai: boolean;
}): StatsCreateur10j {
  const ratio = ratioPosts(input.postes, input.prevus);
  const flag = flagVolume(input.postes, input.prevus);
  const payeUsd = paye10jUsd({
    coutMensuel: input.coutMensuel,
    essai: input.essai,
  });
  return {
    posterId: input.posterId,
    prevus: input.prevus,
    postes: input.postes,
    ratio,
    flagVolume: flag,
    vuesMoy10: input.vuesMoy10,
    vues10j: input.vues10j,
    payeUsd,
    usdPour1000: usdPour1000(payeUsd, input.vues10j),
    ton: tonFlag({
      flagVolume: flag,
      postes: input.postes,
      vuesMoy10: input.vuesMoy10,
      vues10j: input.vues10j,
    }),
  };
}

/** Moyenne HM : ignore les créateurs sans mesure (ratio/vues null). */
export function moyenneHm(stats: StatsCreateur10j[]): {
  ratio: number | null;
  vuesMoy10: number | null;
  usdPour1000: number | null;
  n: number;
} {
  if (stats.length === 0) {
    return { ratio: null, vuesMoy10: null, usdPour1000: null, n: 0 };
  }
  const ratios = stats.map((s) => s.ratio).filter((x): x is number => x != null);
  const vues = stats.map((s) => s.vuesMoy10).filter((x): x is number => x != null);
  const cpm = stats.map((s) => s.usdPour1000).filter((x): x is number => x != null);
  const avg = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    ratio: avg(ratios),
    vuesMoy10: avg(vues),
    usdPour1000: avg(cpm),
    n: stats.length,
  };
}
