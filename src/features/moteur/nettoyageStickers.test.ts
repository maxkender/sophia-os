import { describe, expect, it } from "vitest";

import { aRetirer, enLots, formatDuree, ligneAnalyse, resumeIgnores, tempsRestant } from "./nettoyageStickers";
import type { StickerTestResultat } from "./testStickers";

const resultat = (stickers: Array<"pub" | "contenu" | null>): StickerTestResultat => ({
  id: "x",
  rejete: stickers.includes("pub"),
  contenu: stickers.includes("contenu"),
  slides: stickers.map((sticker, i) => ({ position: i + 1, url: `u${i}`, sticker, texte: "" })),
});

describe("aRetirer", () => {
  it("retire seulement les slideshows avec un sticker pub", () => {
    expect(aRetirer(resultat([null, "pub"]))).toBe(true);
    expect(aRetirer(resultat(["contenu", "pub"]))).toBe(true);
  });

  it("sticker de contenu seul, ou aucun sticker : gardé", () => {
    expect(aRetirer(resultat([null, "contenu"]))).toBe(false);
    expect(aRetirer(resultat([null, null]))).toBe(false);
  });
});

describe("enLots", () => {
  it("découpe en lots de taille fixe, le dernier plus court", () => {
    expect(enLots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enLots([], 100)).toEqual([]);
  });
});

describe("journal", () => {
  const s = { id: "abcdef1234", titre: "#reading #smart #phone" };
  it("ligne d'analyse : pub, propre, erreur", () => {
    expect(ligneAnalyse(s, { statut: "ok", resultat: resultat([null, "pub", "contenu", "pub"]) })).toBe(
      "✗ PUB slides 2, 4 — #reading #smart #phone",
    );
    expect(ligneAnalyse(s, { statut: "ok", resultat: resultat([null, "contenu"]) })).toBe("✓ #reading #smart #phone");
    expect(ligneAnalyse({ id: "abcdef1234", titre: null }, { statut: "erreur", message: "Gemini 503" })).toBe(
      "⚠ abcdef12 — erreur : Gemini 503",
    );
  });

  it("raisons des ignorés regroupées", () => {
    expect(resumeIgnores([{ raison: "pod" }, { raison: "tier A ou mieux" }, { raison: "pod" }])).toBe(
      "pod ×2, tier A ou mieux ×1",
    );
    expect(resumeIgnores([])).toBe("");
  });

  it("durées et temps restant", () => {
    expect(formatDuree(65_000)).toBe("1:05");
    expect(formatDuree(3_725_000)).toBe("1:02:05");
    expect(tempsRestant(0, 10, 5_000)).toBeNull();
    expect(tempsRestant(5, 10, 10_000)).toBe(10_000);
    expect(tempsRestant(10, 10, 10_000)).toBe(0);
  });
});
