import { describe, expect, it } from "vitest";

import {
  bilanStickers,
  enParallele,
  ordreAffichage,
  type EtatStickerTest,
  type FamilleSticker,
  type SlideshowStickerTest,
} from "./testStickers";

const slideshow = (id: string): SlideshowStickerTest => ({
  id,
  titre: id,
  created_at: "2026-10-19T00:00:00Z",
  slides: [{ position: 1, url: `https://x/${id}/1.jpg` }],
});

/** Un slideshow analysé dont la slide 1 porte `famille` (et la slide 2 rien). */
const ok = (id: string, famille: FamilleSticker): EtatStickerTest => ({
  statut: "ok",
  resultat: {
    id,
    rejete: famille === "pub",
    contenu: famille === "contenu",
    slides: [
      { position: 1, url: "u1", sticker: famille, texte: famille === "pub" ? "" : "texte" },
      { position: 2, url: "u2", sticker: null, texte: "suite" },
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
  it("sépare rejetés (pub), stickers de contenu, propres et erreurs", () => {
    const liste = ["a", "b", "c", "d", "e", "f"].map(slideshow);
    const etats: Record<string, EtatStickerTest> = {
      a: ok("a", "pub"),
      b: ok("b", "contenu"),
      c: ok("c", null),
      d: { statut: "erreur", message: "Gemini 503" },
      e: { statut: "encours" },
      f: ok("f", "contenu"),
    };
    expect(bilanStickers(liste, etats)).toEqual({
      total: 6,
      termines: 5,
      rejetes: 1,
      contenus: 2,
      propres: 1,
      erreurs: 1,
      slidesPub: 1,
      slidesContenu: 2,
    });
  });

  it("pub et contenu dans le même slideshow : compté rejeté", () => {
    const etat: EtatStickerTest = {
      statut: "ok",
      resultat: {
        id: "x",
        rejete: true,
        contenu: true,
        slides: [
          { position: 1, url: "u1", sticker: "contenu", texte: "livre" },
          { position: 2, url: "u2", sticker: "pub", texte: "" },
        ],
      },
    };
    const bilan = bilanStickers([slideshow("x")], { x: etat });
    expect([bilan.rejetes, bilan.contenus, bilan.slidesPub, bilan.slidesContenu]).toEqual([1, 0, 1, 1]);
  });
});

describe("ordreAffichage", () => {
  const liste = ["a", "b", "c", "d", "e", "f"].map(slideshow);
  const etats: Record<string, EtatStickerTest> = {
    a: ok("a", null),
    b: ok("b", "pub"),
    c: { statut: "erreur", message: "x" },
    e: ok("e", "contenu"),
    f: ok("f", "pub"),
  };

  it("rejetés d'abord (ordre du tirage), puis contenu, erreurs, en cours, propres", () => {
    expect(ordreAffichage(liste, etats).map((s) => s.id)).toEqual(["b", "f", "e", "c", "d", "a"]);
  });

  it("filtres « pub » et « contenu »", () => {
    expect(ordreAffichage(liste, etats, "pub").map((s) => s.id)).toEqual(["b", "f"]);
    expect(ordreAffichage(liste, etats, "contenu").map((s) => s.id)).toEqual(["e"]);
  });
});
