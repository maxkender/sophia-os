import { describe, expect, it } from "vitest";

import { couperLignes, decouperEmojis, fichiersEmojiApple, geometrieBandeau, largeurLigne, tailleSelonResolution } from "./bandeau";

// Mesure factice : 10 px par caractère.
const mesurer = (s: string) => s.length * 10;

describe("UGC IA, bandeau", () => {
  it("coupe le texte en lignes de mots entiers, et garde les retours à la ligne", () => {
    expect(couperLignes("I could KISS the person who showed me this", 120, mesurer)).toEqual([
      "I could KISS",
      "the person",
      "who showed",
      "me this",
    ]);
    expect(couperLignes("un\ndeux trois", 1000, mesurer)).toEqual(["un", "deux trois"]);
    expect(couperLignes("supercalifragilistique ok", 50, mesurer)).toEqual(["supercalifragilistique", "ok"]);
    expect(couperLignes("   ", 100, mesurer)).toEqual([]);
  });

  it("reprend les proportions mesurées sur de vrais bandeaux Snapchat (720×1280)", () => {
    const une = geometrieBandeau(1280, 1, 35);
    expect(une.taille).toBe(29);
    expect(une.hBande).toBeGreaterThanOrEqual(62);
    expect(une.hBande).toBeLessThanOrEqual(66);
    const deux = geometrieBandeau(1280, 2, 35);
    expect(deux.hBande - une.hBande).toBeGreaterThanOrEqual(33);
    expect(deux.hBande - une.hBande).toBeLessThanOrEqual(36);
  });

  it("place la bande autour de la hauteur voulue, sans sortir de l'image", () => {
    const g = geometrieBandeau(1920, 1, 50);
    expect(g.y + g.hBande / 2).toBeCloseTo(960, -1);
    expect(geometrieBandeau(1920, 1, 0).y).toBe(0);
    const bas = geometrieBandeau(1920, 3, 100);
    expect(bas.y + bas.hBande).toBe(1920);
  });

  it("sépare les emojis du texte, séquences et teintes comprises", () => {
    expect(decouperEmojis("yall wtf 😭😭 ok")).toEqual([
      { emoji: false, texte: "yall wtf " },
      { emoji: true, texte: "😭" },
      { emoji: true, texte: "😭" },
      { emoji: false, texte: " ok" },
    ]);
    expect(decouperEmojis("👩🏽‍💻!").map((m) => m.emoji)).toEqual([true, false]);
    expect(decouperEmojis("❤️")).toEqual([{ emoji: true, texte: "❤️" }]);
  });

  it("compte chaque emoji à sa largeur fixe pour couper les lignes", () => {
    expect(largeurLigne("ab 😭😭", 20, mesurer)).toBe(30 + 2 * 20 * 1.345);
  });

  it("donne les noms de fichier Apple possibles d'un emoji", () => {
    expect(fichiersEmojiApple("😭")).toEqual(["1f62d.png", "1f62d-fe0f.png"]);
    expect(fichiersEmojiApple("❤️")).toEqual(["2764-fe0f.png", "2764.png"]);
    expect(fichiersEmojiApple("👩🏽‍💻")).toEqual(["1f469-1f3fd-200d-1f4bb.png"]);
  });

  it("donne la taille de la vidéo selon la résolution demandée", () => {
    expect(tailleSelonResolution("480p")).toEqual({ largeur: 480, hauteur: 854 });
    expect(tailleSelonResolution("720p")).toEqual({ largeur: 720, hauteur: 1280 });
    expect(tailleSelonResolution("1080p")).toEqual({ largeur: 1080, hauteur: 1920 });
  });
});
