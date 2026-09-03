import { describe, expect, it } from "vitest";

import { normaliserChart } from "./normaliser";
import {
  compterCreateursParLangue,
  formaterRatio,
  lignesPerformanceCreateurs,
  moyenneTrialsParJourParLangue,
} from "./performanceCreateurs";
import type { ChartRcBrut } from "./types";

const trials: ChartRcBrut = {
  display_name: "New Trials",
  resolution: "day",
  values: [
    { cohort: 1787788800, incomplete: false, measure: 0, segment: 1, value: 40 },
    { cohort: 1787788800, incomplete: false, measure: 0, segment: 2, value: 10 },
    { cohort: 1787875200, incomplete: false, measure: 0, segment: 1, value: 20 },
    { cohort: 1787875200, incomplete: false, measure: 0, segment: 2, value: 10 },
    { cohort: 1788393600, incomplete: true, measure: 0, segment: 1, value: 4 },
  ],
  segments: [
    { display_name: "Total", is_total: true },
    { display_name: "Türkiye" },
    { display_name: "France" },
    { display_name: "Other", is_other: true },
  ],
  measures: [{ display_name: "New Trials", unit: "#", decimal_precision: 0 }],
  summary: { total: {} },
};

describe("compterCreateursParLangue", () => {
  it("compte un poster une fois par langue, Sophia seulement", () => {
    expect(
      compterCreateursParLangue([
        { id: "c1", poster_id: "p1", langue: "tr", application_slug: "sophia" },
        { id: "c2", poster_id: "p1", langue: "tr", application_slug: "sophia" },
        { id: "c3", poster_id: "p2", langue: "tr", application_slug: "sophia" },
        { id: "c4", poster_id: "p3", langue: "fr", application_slug: "micabo" },
        { id: "c5", poster_id: "p4", langue: "fr", application_slug: "sophia", is_active: false },
      ]),
    ).toEqual({ tr: 2 });
  });
});

describe("moyenneTrialsParJourParLangue", () => {
  it("exclut le jour incomplet et agrège par langue", () => {
    const { moyenne, jours } = moyenneTrialsParJourParLangue(normaliserChart(trials));
    expect(jours).toBe(2);
    expect(moyenne.tr).toBe(30);
    expect(moyenne.fr).toBe(10);
  });
});

describe("lignesPerformanceCreateurs", () => {
  it("divise la moyenne quotidienne par les créateurs actifs", () => {
    const lignes = lignesPerformanceCreateurs(normaliserChart(trials), [
      { id: "1", poster_id: "a", langue: "tr", application_slug: "sophia" },
      { id: "2", poster_id: "b", langue: "tr", application_slug: "sophia" },
      { id: "3", poster_id: "c", langue: "fr", application_slug: "sophia" },
    ]);
    expect(lignes[0]).toMatchObject({ langue: "tr", trialsJour: 30, createurs: 2, ratio: 15 });
    expect(lignes[1]).toMatchObject({ langue: "fr", trialsJour: 10, createurs: 1, ratio: 10 });
  });

  it("laisse le ratio vide s'il n'y a aucun créateur", () => {
    const lignes = lignesPerformanceCreateurs(normaliserChart(trials), []);
    expect(lignes.find((l) => l.langue === "tr")?.ratio).toBeNull();
    expect(formaterRatio(null)).toBe("—");
    expect(formaterRatio(15)).toBe("15,00");
  });
});
