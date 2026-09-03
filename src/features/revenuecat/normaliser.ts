import type { ChartNormalise, ChartRcBrut, MesureRc, PointRc, SegmentRc } from "./types";

/** cohort Charts v3 = secondes Unix (parfois déjà en ms). */
export function dateDepuisCohort(cohort: number): string {
  const ms = cohort > 1e12 ? cohort : cohort * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function normaliserChart(brut: ChartRcBrut | null | undefined): ChartNormalise {
  const measures: MesureRc[] = (brut?.measures ?? []).map((m) => ({
    nom: m.display_name,
    unite: m.unit ?? "",
    decimales: m.decimal_precision ?? 0,
  }));
  const segments: SegmentRc[] = (brut?.segments ?? []).map((s) => ({
    nom: s.display_name,
    total: Boolean(s.is_total),
    other: Boolean(s.is_other),
  }));

  const points: PointRc[] = [];
  const datesSet = new Set<string>();
  for (const v of brut?.values ?? []) {
    const measure = measures[v.measure];
    const segment = segments[v.segment];
    if (!measure || !segment) continue;
    const date = dateDepuisCohort(v.cohort);
    datesSet.add(date);
    points.push({
      date,
      segment: segment.nom,
      measure: measure.nom,
      value: v.value,
      incomplete: Boolean(v.incomplete),
    });
  }

  return {
    nom: brut?.display_name ?? "",
    resolution: brut?.resolution ?? "",
    measures,
    segments,
    dates: [...datesSet].sort(),
    points,
    totaux: brut?.summary?.total ?? {},
  };
}

export function mesurePrincipale(chart: ChartNormalise): MesureRc | undefined {
  return chart.measures.find((m) => m.unite === "%") ?? chart.measures[0];
}

export function segmentsPays(chart: ChartNormalise): SegmentRc[] {
  const pays = chart.segments.filter((s) => !s.total);
  const totaux = chart.totaux;
  const mesure = mesurePrincipale(chart)?.nom;
  if (!mesure) return pays;
  return [...pays].sort((a, b) => {
    if (a.other !== b.other) return a.other ? 1 : -1;
    const va = totaux[a.nom]?.[mesure] ?? 0;
    const vb = totaux[b.nom]?.[mesure] ?? 0;
    return vb - va;
  });
}

export function point(
  chart: ChartNormalise,
  date: string,
  segment: string,
  measure: string,
): PointRc | undefined {
  return chart.points.find(
    (p) => p.date === date && p.segment === segment && p.measure === measure,
  );
}

export function formaterValeur(valeur: number, mesure: MesureRc | undefined): string {
  if (!mesure) return String(valeur);
  if (mesure.unite === "%") return `${valeur.toFixed(mesure.decimales || 1)} %`;
  if (mesure.unite === "#") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur);
  }
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: mesure.decimales,
  }).format(valeur);
}
