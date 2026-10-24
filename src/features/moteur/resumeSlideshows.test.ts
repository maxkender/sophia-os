import { describe, expect, it } from "vitest";

import { repartitionTiers, totauxSlideshows } from "./resumeSlideshows";
import type { Tier } from "./types";

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

describe("repartitionTiers", () => {
  it("compte chaque rang dans l'ordre D → S+, sans les rangs inconnus", () => {
    const tiers = ["A", "S+", "A", "D", "inconnu"] as Tier[];
    const r = repartitionTiers(tiers.map((tier) => ({ tier })));
    expect(Object.keys(r)).toEqual(["D", "C", "B", "A", "S", "S+"]);
    expect(r).toMatchObject({ D: 1, C: 0, A: 2, "S+": 1 });
  });
});
