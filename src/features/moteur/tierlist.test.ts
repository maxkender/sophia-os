import { describe, expect, it } from "vitest";

import {
  PASSAGES_PAR_TIER,
  TIERS,
  requalifier,
  tierDepuisEloExistant,
  tierImport,
  type Tier,
} from "./tierlist";

/** Raccourci : requalifie sur la seule moyenne, sans passage qui perce. */
function surM(tier: Tier, m: number) {
  return requalifier({ tier, moyenne: m, maxVues: m, nb150k: 0 }).tier;
}

describe("passages par rang", () => {
  it("double à chaque cran, 0 en D", () => {
    expect(TIERS).toEqual(["D", "C", "B", "A", "S", "S+"]);
    expect(PASSAGES_PAR_TIER).toEqual({ D: 0, C: 1, B: 2, A: 4, S: 8, "S+": 16 });
  });
});

describe("premier placement à l'import", () => {
  it("refuse sous le seuil", () => {
    expect(tierImport(54.9)).toBeNull();
    expect(tierImport(0)).toBeNull();
    expect(tierImport(Number.NaN)).toBeNull();
  });

  it("place en C, B puis A", () => {
    expect(tierImport(55)).toBe("C");
    expect(tierImport(59.9)).toBe("C");
    expect(tierImport(60)).toBe("B");
    expect(tierImport(69.9)).toBe("B");
    expect(tierImport(70)).toBe("A");
    expect(tierImport(100)).toBe("A");
  });

  it("ne place jamais directement en S ou S+", () => {
    for (let note = 55; note <= 100; note += 1) {
      expect(["C", "B", "A"]).toContain(tierImport(note));
    }
  });

  it("suit un seuil personnalisé", () => {
    expect(tierImport(58, 60)).toBeNull();
    expect(tierImport(62, 60)).toBe("B");
  });
});

describe("requalification depuis D", () => {
  it("reste en D sous 600", () => {
    expect(surM("D", 0)).toBe("D");
    expect(surM("D", 599)).toBe("D");
  });

  it("monte en C entre 600 et 1 000", () => {
    expect(surM("D", 600)).toBe("C");
    expect(surM("D", 999)).toBe("C");
  });

  it("monte en B entre 1 000 et 5 000", () => {
    expect(surM("D", 1_000)).toBe("B");
    expect(surM("D", 4_999)).toBe("B");
  });

  it("monte en A au-delà de 5 000", () => {
    expect(surM("D", 5_000)).toBe("A");
  });
});

describe("requalification depuis C", () => {
  it("descend en D sous 600", () => {
    expect(surM("C", 599)).toBe("D");
  });

  it("reste en C entre 600 et 1 000", () => {
    expect(surM("C", 600)).toBe("C");
    expect(surM("C", 999)).toBe("C");
  });

  it("monte en B puis A", () => {
    expect(surM("C", 1_000)).toBe("B");
    expect(surM("C", 5_000)).toBe("A");
    expect(surM("C", 29_999)).toBe("A");
  });

  it("monte en S dès qu'un passage dépasse 30k", () => {
    expect(requalifier({ tier: "C", moyenne: 700, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
  });
});

describe("requalification depuis B", () => {
  it("descend en C sous 1 000", () => {
    expect(surM("B", 999)).toBe("C");
  });

  it("reste en B entre 1 000 et 5 000", () => {
    expect(surM("B", 1_000)).toBe("B");
    expect(surM("B", 4_999)).toBe("B");
  });

  it("monte en A entre 5 000 et 30 000", () => {
    expect(surM("B", 5_000)).toBe("A");
    expect(surM("B", 29_999)).toBe("A");
  });

  it("monte en S puis S+ sur un passage qui perce", () => {
    expect(requalifier({ tier: "B", moyenne: 1_200, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
    expect(requalifier({ tier: "B", moyenne: 1_200, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });
});

describe("requalification depuis A", () => {
  it("descend en B sous 5 000", () => {
    expect(surM("A", 4_999)).toBe("B");
  });

  it("reste en A entre 5 000 et 30 000", () => {
    expect(surM("A", 5_000)).toBe("A");
    expect(surM("A", 29_999)).toBe("A");
  });

  it("monte en S puis S+ sur un passage qui perce", () => {
    expect(requalifier({ tier: "A", moyenne: 6_000, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
    expect(requalifier({ tier: "A", moyenne: 6_000, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });
});

describe("requalification depuis S", () => {
  it("descend en A si aucun passage ne dépasse 30k", () => {
    expect(requalifier({ tier: "S", moyenne: 29_999, maxVues: 29_999, nb150k: 0 }).tier).toBe("A");
  });

  it("reste en S si un passage dépasse 30k, même avec une moyenne basse", () => {
    expect(requalifier({ tier: "S", moyenne: 4_000, maxVues: 31_000, nb150k: 0 }).tier).toBe("S");
  });

  it("monte en S+ sur un passage à 150k", () => {
    expect(requalifier({ tier: "S", moyenne: 20_000, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });
});

describe("requalification depuis S+", () => {
  it("reste en S+ avec deux passages à 150k", () => {
    expect(requalifier({ tier: "S+", moyenne: 40_000, maxVues: 300_000, nb150k: 2 }).tier).toBe("S+");
  });

  it("redescend en S avec un seul passage à 150k", () => {
    expect(requalifier({ tier: "S+", moyenne: 40_000, maxVues: 300_000, nb150k: 1 }).tier).toBe("S");
  });

  it("redescend en S sans aucun passage à 150k, même très haute moyenne", () => {
    expect(requalifier({ tier: "S+", moyenne: 120_000, maxVues: 140_000, nb150k: 0 }).tier).toBe("S");
  });
});

describe("priorité du passage qui perce sur la moyenne", () => {
  it("un seul passage à 150k fait monter en S+ depuis B et A", () => {
    // 2 passages en B : 150k et 0 → m = 75k, mais c'est bien le max qui décide.
    expect(requalifier({ tier: "B", moyenne: 75_000, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
    expect(requalifier({ tier: "A", moyenne: 300, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });

  it("30k l'emporte sur une moyenne qui ferait descendre", () => {
    expect(requalifier({ tier: "A", moyenne: 100, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
  });
});

describe("migration de l'ELO natif vers un rang", () => {
  it("suit le barème décalé (< 55 en D)", () => {
    expect(tierDepuisEloExistant(0)).toBe("D");
    expect(tierDepuisEloExistant(54.9)).toBe("D");
    expect(tierDepuisEloExistant(55)).toBe("C");
    expect(tierDepuisEloExistant(64.9)).toBe("C");
    expect(tierDepuisEloExistant(65)).toBe("B");
    expect(tierDepuisEloExistant(74.9)).toBe("B");
    expect(tierDepuisEloExistant(75)).toBe("A");
    expect(tierDepuisEloExistant(84.9)).toBe("A");
    expect(tierDepuisEloExistant(85)).toBe("S");
    expect(tierDepuisEloExistant(88.9)).toBe("S");
    expect(tierDepuisEloExistant(89)).toBe("S+");
  });
});

describe("cohérence des cycles", () => {
  it("tout rang atteignable a un nombre de passages fini et positif sauf D", () => {
    for (const tier of TIERS) {
      const n = PASSAGES_PAR_TIER[tier];
      expect(Number.isInteger(n)).toBe(true);
      expect(n >= 0).toBe(true);
      if (tier !== "D") expect(n).toBeGreaterThan(0);
    }
  });

  it("une requalification renvoie toujours un rang connu", () => {
    for (const tier of TIERS) {
      for (const m of [0, 599, 600, 1_000, 5_000, 29_999, 30_000, 200_000]) {
        expect(TIERS).toContain(requalifier({ tier, moyenne: m, maxVues: m, nb150k: 0 }).tier);
      }
    }
  });
});
