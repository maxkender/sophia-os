import { describe, expect, it } from "vitest";

import { aRetirer, enLots } from "./nettoyageStickers";
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
