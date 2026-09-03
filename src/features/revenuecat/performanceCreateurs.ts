import { estSlugSophia } from "@/features/moteur/applications";

import { mesurePrincipale } from "./normaliser";
import { langueDepuisPays } from "./paysLangue";
import type { ChartNormalise } from "./types";

export interface ComptePourPerf {
  id?: string;
  poster_id?: string | null;
  langue?: string | null;
  application_slug?: string | null;
  is_active?: boolean;
}

export interface LignePerformanceCreateurs {
  langue: string;
  trialsJour: number;
  createurs: number;
  ratio: number | null;
  jours: number;
}

/** Créateurs uniques (poster) par langue, comptes Sophia actifs seulement. */
export function compterCreateursParLangue(comptes: ComptePourPerf[]): Record<string, number> {
  const vus = new Set<string>();
  const n: Record<string, number> = {};
  for (const compte of comptes) {
    if (compte.is_active === false) continue;
    if (!estSlugSophia(compte.application_slug)) continue;
    const langue = (compte.langue ?? "").trim().toLowerCase();
    if (!langue) continue;
    const identifiant = compte.poster_id || compte.id;
    if (!identifiant) continue;
    const cle = `${langue}:${identifiant}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    n[langue] = (n[langue] ?? 0) + 1;
  }
  return n;
}

function datesPourMoyenne(chart: ChartNormalise, measure: string): string[] {
  const completes = chart.dates.filter((date) => {
    const pts = chart.points.filter((p) => p.date === date && p.measure === measure);
    return pts.length > 0 && pts.every((p) => !p.incomplete);
  });
  return completes.length > 0 ? completes : chart.dates;
}

/** Moyenne des nouveaux trials / jour, agrégée par langue (jours incomplets exclus). */
export function moyenneTrialsParJourParLangue(chart: ChartNormalise): {
  moyenne: Record<string, number>;
  jours: number;
} {
  const measure = mesurePrincipale(chart)?.nom;
  if (!measure || chart.dates.length === 0) return { moyenne: {}, jours: 0 };

  const dates = datesPourMoyenne(chart, measure);
  const langues = new Set<string>();
  const parJourLangue = new Map<string, number>();

  for (const point of chart.points) {
    if (point.measure !== measure) continue;
    const seg = chart.segments.find((s) => s.nom === point.segment);
    if (!seg || seg.total || seg.other) continue;
    const langue = langueDepuisPays(point.segment);
    if (!langue) continue;
    langues.add(langue);
    const cle = `${point.date}:${langue}`;
    parJourLangue.set(cle, (parJourLangue.get(cle) ?? 0) + point.value);
  }

  const moyenne: Record<string, number> = {};
  for (const langue of langues) {
    let somme = 0;
    for (const date of dates) {
      somme += parJourLangue.get(`${date}:${langue}`) ?? 0;
    }
    moyenne[langue] = somme / dates.length;
  }

  return { moyenne, jours: dates.length };
}

export function lignesPerformanceCreateurs(
  chart: ChartNormalise,
  comptes: ComptePourPerf[],
): LignePerformanceCreateurs[] {
  const createurs = compterCreateursParLangue(comptes);
  const { moyenne, jours } = moyenneTrialsParJourParLangue(chart);
  const langues = new Set([...Object.keys(createurs), ...Object.keys(moyenne)]);

  return [...langues]
    .map((langue) => {
      const trialsJour = moyenne[langue] ?? 0;
      const n = createurs[langue] ?? 0;
      return {
        langue,
        trialsJour,
        createurs: n,
        ratio: n > 0 ? trialsJour / n : null,
        jours,
      };
    })
    .filter((ligne) => ligne.createurs > 0 || ligne.trialsJour > 0)
    .sort((a, b) => {
      const ra = a.ratio ?? -1;
      const rb = b.ratio ?? -1;
      if (rb !== ra) return rb - ra;
      if (b.trialsJour !== a.trialsJour) return b.trialsJour - a.trialsJour;
      return a.langue.localeCompare(b.langue);
    });
}

export function formaterRatio(ratio: number | null): string {
  if (ratio == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ratio);
}

export function formaterMoyenneTrials(valeur: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(valeur);
}
