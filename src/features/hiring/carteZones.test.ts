import { describe, expect, it } from "vitest";

import {
  construireCarte,
  morceauxDeZone,
  palierZone,
  paysDeZone,
  type ZoneCarte,
} from "./carteZones";

const NOMS_CARTE = [
  "Turkey",
  "Israel",
  "Germany",
  "Norway",
  "Estonia",
  "Finland",
  "Russia",
  "Belarus",
  "Kazakhstan",
  "United States of America",
  "United Kingdom",
  "Australia",
  "New Zealand",
  "Ireland",
  "United Arab Emirates",
  "Slovakia",
  "Czechia",
  "Bulgaria",
];

function zone(cle: string, libelle: string, total: number): ZoneCarte {
  return {
    cle,
    zone: libelle,
    compteurs: { total, pasCree: 0, warmup: 0, actif: total },
    recruteurs: [],
  };
}

describe("morceauxDeZone", () => {
  it("découpe sur +, virgule, /, & et « et » / « and »", () => {
    expect(morceauxDeZone("Turkey + Israel")).toEqual(["Turkey", "Israel"]);
    expect(morceauxDeZone("Spain, Portugal / Italy & Greece et France and UK")).toEqual([
      "Spain",
      "Portugal",
      "Italy",
      "Greece",
      "France",
      "UK",
    ]);
  });
});

describe("paysDeZone", () => {
  it("place les zones de la master list, abréviations comprises", () => {
    expect(paysDeZone("US + UK", NOMS_CARTE).pays).toEqual([
      "United States of America",
      "United Kingdom",
    ]);
    expect(paysDeZone("Australia + NZ + Ireland", NOMS_CARTE).pays).toEqual([
      "Australia",
      "New Zealand",
      "Ireland",
    ]);
    expect(paysDeZone("UAE + Slovakia", NOMS_CARTE).pays).toEqual([
      "United Arab Emirates",
      "Slovakia",
    ]);
  });

  it("« Russian-speaking » couvre les grands pays russophones, sans doublon", () => {
    expect(paysDeZone("Estonia + Finland + Russian-speaking + Russia", NOMS_CARTE)).toEqual({
      pays: ["Estonia", "Finland", "Russia", "Belarus", "Kazakhstan"],
      inconnus: [],
    });
  });

  it("noms français et accents", () => {
    expect(paysDeZone("Turquie + Tchéquie", NOMS_CARTE).pays).toEqual(["Turkey", "Czechia"]);
  });

  it("un pays écrit comme le fond de carte se place sans alias, le reste est signalé", () => {
    expect(paysDeZone("bulgaria + Atlantis", NOMS_CARTE)).toEqual({
      pays: ["Bulgaria"],
      inconnus: ["Atlantis"],
    });
  });
});

describe("construireCarte", () => {
  it("relie pays et zones, garde le max et les morceaux non placés", () => {
    const carte = construireCarte(
      [zone("turkey + israel", "Turkey + Israel", 21), zone("germany + norway", "Germany + Norway", 27), zone("x", "Atlantis", 0)],
      NOMS_CARTE,
    );
    expect(carte.zonesParPays.get("Israel")).toEqual(["turkey + israel"]);
    expect(carte.paysParZone.get("germany + norway")).toEqual(["Germany", "Norway"]);
    expect(carte.max).toBe(27);
    expect(carte.nonPlacees).toEqual([{ cle: "x", zone: "Atlantis", inconnus: ["Atlantis"] }]);
  });

  it("un pays partagé par deux zones les garde toutes les deux", () => {
    const carte = construireCarte([zone("a", "Ireland", 1), zone("b", "UK + Ireland", 2)], NOMS_CARTE);
    expect(carte.zonesParPays.get("Ireland")).toEqual(["a", "b"]);
  });
});

describe("palierZone", () => {
  it("0 sans créateur, puis 1..5 selon la part du max", () => {
    expect(palierZone(0, 27)).toBe(0);
    expect(palierZone(1, 27)).toBe(1);
    expect(palierZone(14, 27)).toBe(3);
    expect(palierZone(27, 27)).toBe(5);
    expect(palierZone(5, 0)).toBe(0);
  });
});
