import { describe, expect, it } from "vitest";

import { MAX_COMPTES_PAR_POSTER, peutAjouterCompteTikTok } from "./comptesPoster";

describe("peutAjouterCompteTikTok", () => {
  it("autorise 0 ou 1 compte, refuse à partir de 2", () => {
    expect(MAX_COMPTES_PAR_POSTER).toBe(2);
    expect(peutAjouterCompteTikTok(0)).toBe(true);
    expect(peutAjouterCompteTikTok(1)).toBe(true);
    expect(peutAjouterCompteTikTok(2)).toBe(false);
    expect(peutAjouterCompteTikTok(3)).toBe(false);
    expect(peutAjouterCompteTikTok(-1)).toBe(false);
  });
});
