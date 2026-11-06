import { describe, expect, it } from "vitest";

import { controleEnRetard, reglesEnDefaut, texteBandeau } from "./logique";

describe("bandeau cohérence", () => {
  it("affiche ✅ seulement à 12/12", () => {
    expect(texteBandeau({ ok: 12 })).toBe("Cohérence : ✅ 12/12");
    expect(texteBandeau({ ok: 3 })).toBe("Cohérence : ⚠️ 3/12");
    expect(texteBandeau(null)).toBe("Cohérence : ⚠️ 0/12");
  });

  it("trie les règles en défaut par nombre de cas et ignore les règles vertes", () => {
    const r = reglesEnDefaut({ par_regle: { "1": 1, "7": 111, "5": 23, "9": 0, "99": 4 } });
    expect(r.map((x) => x.regle)).toEqual([7, 5, 1]);
    expect(r[0].titre).toMatch(/Contrat VIk/);
  });

  it("signale un contrôle de plus de 2 h", () => {
    const now = Date.parse("2026-11-06T18:00:00Z");
    expect(controleEnRetard("2026-11-06T17:41:00Z", now)).toBe(false);
    expect(controleEnRetard("2026-11-06T15:41:00Z", now)).toBe(true);
    expect(controleEnRetard(null, now)).toBe(true);
  });
});
