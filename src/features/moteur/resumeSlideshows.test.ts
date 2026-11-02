import { describe, expect, it } from "vitest";

import { repartitionBleo, totauxSlideshows } from "./resumeSlideshows";

describe("totauxSlideshows", () => {
  it("additionne les comptes et donne la part gardée", () => {
    const r = totauxSlideshows([
      { compteReferenceId: "a", handle: "a", importes: 30, gardes: 20, rejetes: 8, encours: 2 },
      { compteReferenceId: null, handle: "", importes: 10, gardes: 4, rejetes: 6, encours: 0 },
    ]);
    expect(r).toEqual({ importes: 40, gardes: 24, rejetes: 14, encours: 2, partGardes: 60 });
  });

  it("sans import, pas de part", () => {
    expect(totauxSlideshows([]).partGardes).toBeNull();
  });
});

describe("repartitionBleo", () => {
  it("compte chaque verdict et chaque état, dans l'ordre de lecture, et les slideshows hors BLEO à part", () => {
    const r = repartitionBleo([
      { verdict: "gagnant", etat_bleo: "juge" },
      { verdict: "en_attente", etat_bleo: "en_test" },
      { verdict: "en_attente", etat_bleo: "a_juger" },
      { verdict: "non_gagnant", etat_bleo: "juge" },
      null,
      undefined,
    ]);
    expect(Object.keys(r.verdicts)).toEqual(["gagnant", "en_attente", "non_gagnant"]);
    expect(Object.keys(r.etats)).toEqual(["a_juger", "en_test", "juge"]);
    expect(r).toEqual({
      verdicts: { gagnant: 1, en_attente: 2, non_gagnant: 1 },
      etats: { a_juger: 1, en_test: 1, juge: 2 },
      horsBleo: 2,
    });
  });

  it("un verdict ou un état vide ne compte pas, mais le slideshow reste dans BLEO", () => {
    const r = repartitionBleo([{ verdict: null, etat_bleo: "a_juger" }, { verdict: "gagnant", etat_bleo: null }]);
    expect(r.verdicts).toEqual({ gagnant: 1, en_attente: 0, non_gagnant: 0 });
    expect(r.etats).toEqual({ a_juger: 1, en_test: 0, juge: 0 });
    expect(r.horsBleo).toBe(0);
  });

  it("rien d'affiché, tout à zéro", () => {
    expect(repartitionBleo([])).toEqual({
      verdicts: { gagnant: 0, en_attente: 0, non_gagnant: 0 },
      etats: { a_juger: 0, en_test: 0, juge: 0 },
      horsBleo: 0,
    });
  });
});
