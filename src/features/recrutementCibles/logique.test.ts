import { describe, expect, it } from "vitest";

import type { CibleRecrutement } from "./api";
import { parCohorte, recrutesParPays } from "./logique";

const l = (cohorte: string, pays: string, cible: number, recrutes: number): CibleRecrutement => ({
  controle_id: null,
  cohorte,
  pays,
  hm_id: null,
  cible,
  recrutes,
  ecart: Math.max(cible - recrutes, 0),
  envoye_at: null,
});

describe("cibles de recrutement (prompt 21, D)", () => {
  const lignes = [l("2026-11-02", "DE", 5, 6), l("2026-11-02", "FR", 4, 1), l("2026-11-02", "GR", 0, 11), l("2026-11-09", "FR", 3, 0)];

  it("par cohorte, la plus récente d'abord, le plus gros écart en tête", () => {
    const g = parCohorte(lignes);
    expect(g.map((c) => c.cohorte)).toEqual(["2026-11-09", "2026-11-02"]);
    expect(g[1]!.lignes.map((x) => x.pays)).toEqual(["FR", "DE", "GR"]);
    // Un pays en avance (DE) ne comble pas le manque d'un autre (FR).
    expect(g[1]).toMatchObject({ cible: 9, recrutes: 18, ecart: 3 });
  });

  it("vue HM : seulement les pays qui ont une cible, depuis une date", () => {
    const g = parCohorte(lignes, { avecCible: true, depuis: "2026-11-03" });
    expect(g).toHaveLength(1);
    expect(g[0]!.lignes.map((x) => x.pays)).toEqual(["FR"]);
  });

  it("les recrutés par pays d'une cohorte", () => {
    expect(recrutesParPays(lignes, "2026-11-02").get("GR")).toBe(11);
    expect(recrutesParPays(lignes, "2026-11-09").get("DE")).toBeUndefined();
  });
});
