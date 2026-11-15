import { describe, expect, it } from "vitest";

import type { DonneesCkd } from "./api";
import { donneesSures } from "./logique";

describe("6/11 : une décision posée à la main (sans période) ne fait plus planter Weekly decisions", () => {
  it("complète la période, la médiane, les réglages et les listes", () => {
    const d = donneesSures({ handle: "x.y1", motifs: [] } as unknown as Partial<DonneesCkd>);
    expect(d.periode.attendus - d.periode.publies).toBe(0);
    expect(d.periode.liens_manquants).toEqual([]);
    expect(d.mediane_ref.valeur).toBeNull();
    expect(d.reglages.part_mediane_pays?.v).toBeUndefined();
    expect(d.autres_comptes).toEqual([]);
    expect(donneesSures(null).handle).toBeNull();
  });

  it("garde les vraies valeurs", () => {
    const d = donneesSures({ periode: { attendus: 14, publies: 9 } } as unknown as Partial<DonneesCkd>);
    expect(d.periode.attendus - d.periode.publies).toBe(5);
  });
});
