import { describe, expect, it } from "vitest";

import { runOfficiel, type RunBleo } from "./api";
import { formaterJour, formaterPart, formaterVues, part } from "./format";

describe("BLEO, mise en forme", () => {
  it("vues en court", () => {
    expect(formaterVues(null)).toBe("—");
    expect(formaterVues(950)).toBe("950");
    expect(formaterVues(1234)).toBe("1,2 k");
    expect(formaterVues(13840)).toBe("14 k");
    expect(formaterVues(1_400_000)).toBe("1,4 M");
  });

  it("parts et pourcentages", () => {
    expect(formaterPart(0.302)).toBe("30 %");
    expect(formaterPart(null)).toBe("—");
    expect(part(149, 498)).toBeCloseTo(0.299, 3);
    expect(part(3, 0)).toBeNull();
  });

  it("jour lisible", () => {
    expect(formaterJour("2026-10-30", "fr")).toMatch(/30/);
    expect(formaterJour(null)).toBe("—");
  });

  it("le plan officiel est le dernier tirage fini sans erreur", () => {
    const run = (id: string, fini: boolean, erreur: string | null): RunBleo => ({
      id,
      jour_vise: "2026-10-30",
      mode: "ombre",
      demarre_le: "2026-10-29T12:00:00Z",
      fini_le: fini ? "2026-10-29T12:00:18Z" : null,
      resume: null,
      erreur,
    });
    expect(runOfficiel([run("a", false, "essai manuel"), run("b", true, null), run("c", true, null)])?.id).toBe("b");
    expect(runOfficiel([run("a", false, null)])).toBeNull();
  });
});
