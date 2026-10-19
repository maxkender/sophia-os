import { describe, expect, it } from "vitest";

import {
  bilanStickers,
  enParallele,
  ordreAffichage,
  type EtatStickerTest,
  type SlideshowStickerTest,
} from "./testStickers";

const slideshow = (id: string): SlideshowStickerTest => ({
  id,
  titre: id,
  created_at: "2026-10-19T00:00:00Z",
  slides: [{ position: 1, url: `https://x/${id}/1.jpg` }],
});

const ok = (id: string, sticker: boolean): EtatStickerTest => ({
  statut: "ok",
  resultat: {
    id,
    sticker,
    slides: [
      { position: 1, url: "u1", sticker, texte: sticker ? "" : "texte" },
      { position: 2, url: "u2", sticker: false, texte: "suite" },
    ],
  },
});

describe("enParallele", () => {
  it("traite tout, jamais plus de N à la fois", async () => {
    let enCours = 0;
    let pic = 0;
    const faits: number[] = [];
    await enParallele(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      enCours += 1;
      pic = Math.max(pic, enCours);
      await new Promise((r) => setTimeout(r, 1 + (i % 3)));
      faits.push(i);
      enCours -= 1;
    });
    expect(faits.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(pic).toBe(4);
  });

  it("une tâche qui échoue n'arrête pas les autres", async () => {
    const faits: number[] = [];
    await enParallele([1, 2, 3], 2, async (i) => {
      if (i === 2) throw new Error("boum");
      faits.push(i);
    });
    expect(faits.sort()).toEqual([1, 3]);
  });

  it("liste vide : rien, sans attendre", async () => {
    await enParallele([], 8, async () => {
      throw new Error("jamais appelé");
    });
  });
});

describe("bilanStickers", () => {
  it("compte stickers, propres, erreurs et slides à sticker", () => {
    const liste = ["a", "b", "c", "d", "e"].map(slideshow);
    const etats: Record<string, EtatStickerTest> = {
      a: ok("a", true),
      b: ok("b", false),
      c: { statut: "erreur", message: "Gemini 503" },
      d: { statut: "encours" },
    };
    expect(bilanStickers(liste, etats)).toEqual({
      total: 5,
      termines: 3,
      stickers: 1,
      propres: 1,
      erreurs: 1,
      slidesSticker: 1,
    });
  });
});

describe("ordreAffichage", () => {
  const liste = ["a", "b", "c", "d", "e"].map(slideshow);
  const etats: Record<string, EtatStickerTest> = {
    a: ok("a", false),
    b: ok("b", true),
    c: { statut: "erreur", message: "x" },
    e: ok("e", true),
  };

  it("stickers d'abord (ordre du tirage), puis erreurs, en cours, propres", () => {
    expect(ordreAffichage(liste, etats).map((s) => s.id)).toEqual(["b", "e", "c", "d", "a"]);
  });

  it("filtre « stickers seuls »", () => {
    expect(ordreAffichage(liste, etats, true).map((s) => s.id)).toEqual(["b", "e"]);
  });
});
