import { describe, expect, it } from "vitest";

import { decisionPreparee, lundiDuProchainSamedi } from "./semaineComptes";

describe("0492 : préparer la décision du samedi", () => {
  it("le lundi de la semaine du prochain samedi (Paris)", () => {
    expect(lundiDuProchainSamedi("2026-11-02")).toBe("2026-11-02"); // lundi
    expect(lundiDuProchainSamedi("2026-11-05")).toBe("2026-11-02"); // jeudi
    expect(lundiDuProchainSamedi("2026-11-07")).toBe("2026-11-02"); // samedi : ce samedi
    expect(lundiDuProchainSamedi("2026-11-01")).toBe("2026-11-02"); // dimanche : le samedi suivant
    expect(lundiDuProchainSamedi("2026-11-08")).toBe("2026-11-09");
  });

  it("préparée : un brouillon autre que Keep", () => {
    expect(decisionPreparee(undefined)).toBe(false);
    expect(decisionPreparee({ choix: "keep", raison: null })).toBe(false);
    expect(decisionPreparee({ choix: "double", raison: null })).toBe(true);
  });
});
