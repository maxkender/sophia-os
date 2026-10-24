import { describe, expect, it } from "vitest";

import { abrege, graduations, indexEtiquettes, moyenneGlissante } from "./echelle";

describe("graduations", () => {
  it("part de zéro et englobe la plus grande valeur", () => {
    const g = graduations([120_000, 290_000, 455_000]);
    expect(g.min).toBe(0);
    expect(g.max).toBeGreaterThanOrEqual(455_000);
    expect(g.ticks[0]).toBe(0);
    expect(g.ticks[g.ticks.length - 1]).toBe(g.max);
  });

  it("tombe sur des pas ronds", () => {
    expect(graduations([0, 18]).ticks).toEqual([0, 5, 10, 15, 20]);
  });

  it("descend sous zéro quand une valeur est négative", () => {
    // Un compte désactivé fait baisser le total : le Δ du jour est négatif.
    const g = graduations([-40_000, 300_000]);
    expect(g.min).toBeLessThan(0);
    expect(g.ticks).toContain(0);
  });

  it("ignore les trous et rend un axe utilisable sans données", () => {
    expect(graduations([null, null])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(graduations([null, 7]).max).toBeGreaterThanOrEqual(7);
  });
});

describe("moyenneGlissante", () => {
  it("moyenne les n derniers points, point courant compris", () => {
    expect(moyenneGlissante([2, 4, 6, 8], 2)).toEqual([2, 3, 5, 7]);
  });

  it("saute les trous sans les compter comme des zéros", () => {
    expect(moyenneGlissante([10, null, 20], 3)).toEqual([10, 10, 15]);
    expect(moyenneGlissante([null, null], 7)).toEqual([null, null]);
  });
});

describe("indexEtiquettes", () => {
  it("garde le premier et le dernier point", () => {
    const idx = indexEtiquettes(30);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(29);
    expect(idx.length).toBeLessThanOrEqual(6);
  });

  it("n'en colle jamais deux, même avec un pas qui tombe mal", () => {
    for (const n of [8, 14, 30, 31, 90]) {
      for (const combien of [2, 3, 4, 5]) {
        const idx = indexEtiquettes(n, combien);
        const pas = Math.ceil((n - 1) / (combien - 1));
        expect(idx[0]).toBe(0);
        expect(idx[idx.length - 1]).toBe(n - 1);
        for (let k = 1; k < idx.length; k++) expect(idx[k]! - idx[k - 1]!).toBeGreaterThanOrEqual((pas * 3) / 4);
      }
    }
  });

  it("étiquette tout quand il y a peu de points", () => {
    expect(indexEtiquettes(3)).toEqual([0, 1, 2]);
    expect(indexEtiquettes(0)).toEqual([]);
  });
});

describe("abrege", () => {
  it("abrège en français et en anglais", () => {
    expect(abrege(290_000, "fr").replace(/\s/g, " ")).toBe("290 k");
    expect(abrege(290_000, "en")).toBe("290K");
    expect(abrege(1_250, "en")).toBe("1.3K");
    expect(abrege(42, "fr")).toBe("42");
  });
});
