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
  it("retire selon les familles cochées", () => {
    expect(aRetirer(resultat([null, "contenu"]), ["pub", "contenu"])).toBe(true);
    expect(aRetirer(resultat([null, "contenu"]), ["contenu"])).toBe(true);
    expect(aRetirer(resultat([null, "contenu"]), ["pub"])).toBe(false);
    expect(aRetirer(resultat(["pub", null]), ["pub"])).toBe(true);
  });

  it("sans sticker, ou aucune famille cochée : gardé", () => {
    expect(aRetirer(resultat([null, null]), ["pub", "contenu"])).toBe(false);
    expect(aRetirer(resultat(["pub", "contenu"]), [])).toBe(false);
  });
});

describe("enLots", () => {
  it("découpe en lots de taille fixe, le dernier plus court", () => {
    expect(enLots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enLots([], 100)).toEqual([]);
  });
});
