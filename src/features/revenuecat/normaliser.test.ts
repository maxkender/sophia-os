import { describe, expect, it } from "vitest";

import {
  dateDepuisCohort,
  formaterValeur,
  mesurePrincipale,
  normaliserChart,
  point,
  segmentsPays,
} from "./normaliser";
import type { ChartRcBrut } from "./types";

const trials: ChartRcBrut = {
  display_name: "New Trials",
  resolution: "day",
  values: [
    { cohort: 1787788800, incomplete: false, measure: 0, segment: 0, value: 187 },
    { cohort: 1787788800, incomplete: false, measure: 0, segment: 1, value: 41 },
    { cohort: 1787788800, incomplete: false, measure: 0, segment: 2, value: 22 },
    { cohort: 1788393600, incomplete: true, measure: 0, segment: 0, value: 104 },
    { cohort: 1788393600, incomplete: true, measure: 0, segment: 1, value: 11 },
  ],
  segments: [
    { display_name: "Total", is_total: true },
    { display_name: "Türkiye" },
    { display_name: "Poland" },
  ],
  measures: [{ display_name: "New Trials", unit: "#", decimal_precision: 0 }],
  summary: {
    total: {
      Total: { "New Trials": 1793 },
      Türkiye: { "New Trials": 341 },
      Poland: { "New Trials": 289 },
    },
  },
};

const conversion: ChartRcBrut = {
  display_name: "Trial Conversion Rate",
  resolution: "week",
  values: [
    { cohort: 1785628800, incomplete: false, measure: 4, segment: 1, value: 21.65 },
    { cohort: 1785628800, incomplete: false, measure: 0, segment: 1, value: 254 },
  ],
  segments: [{ display_name: "Total", is_total: true }, { display_name: "Türkiye" }],
  measures: [
    { display_name: "Trial Starts", unit: "#", decimal_precision: 0 },
    { display_name: "Conversions", unit: "#", decimal_precision: 0 },
    { display_name: "Expirations", unit: "#", decimal_precision: 0 },
    { display_name: "Pending", unit: "#", decimal_precision: 0 },
    { display_name: "Conversion Rate", unit: "%", decimal_precision: 1 },
  ],
  summary: {
    total: {
      Türkiye: { "Conversion Rate": 21.3, "Trial Starts": 1498 },
    },
  },
};

describe("dateDepuisCohort", () => {
  it("lit les secondes Unix Charts v3", () => {
    expect(dateDepuisCohort(1787788800)).toBe("2026-08-27");
  });

  it("accepte déjà des millisecondes", () => {
    expect(dateDepuisCohort(1787788800_000)).toBe("2026-08-27");
  });
});

describe("normaliserChart", () => {
  it("pivote values → points datés par pays", () => {
    const chart = normaliserChart(trials);
    expect(chart.nom).toBe("New Trials");
    expect(chart.dates).toEqual(["2026-08-27", "2026-09-03"]);
    expect(point(chart, "2026-08-27", "Türkiye", "New Trials")?.value).toBe(41);
    expect(point(chart, "2026-09-03", "Total", "New Trials")?.incomplete).toBe(true);
  });

  it("ignore un index de segment hors bornes", () => {
    const chart = normaliserChart({
      ...trials,
      values: [{ cohort: 1787788800, measure: 0, segment: 99, value: 1 }],
    });
    expect(chart.points).toEqual([]);
  });

  it("choisit la mesure % comme principale", () => {
    const chart = normaliserChart(conversion);
    expect(mesurePrincipale(chart)?.nom).toBe("Conversion Rate");
    expect(formaterValeur(21.7, mesurePrincipale(chart))).toBe("21.7 %");
  });

  it("classe les pays par total, Other à la fin", () => {
    const chart = normaliserChart({
      ...trials,
      segments: [
        { display_name: "Total", is_total: true },
        { display_name: "Other", is_other: true },
        { display_name: "Poland" },
        { display_name: "Türkiye" },
      ],
      summary: {
        total: {
          Other: { "New Trials": 10 },
          Poland: { "New Trials": 289 },
          Türkiye: { "New Trials": 341 },
        },
      },
    });
    expect(segmentsPays(chart).map((s) => s.nom)).toEqual(["Türkiye", "Poland", "Other"]);
  });
});
