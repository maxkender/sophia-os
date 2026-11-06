import { describe, expect, it } from "vitest";

import { couperLignes, geometrieBandeau, tailleSelonResolution } from "./bandeau";

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

  it("place la bande autour de la hauteur voulue, sans sortir de l'image", () => {
    const g = geometrieBandeau(1920, 1, 50);
    expect(g.taille).toBe(43);
    expect(g.y + g.hBande / 2).toBeCloseTo(960, -1);
    expect(geometrieBandeau(1920, 1, 0).y).toBe(0);
    const bas = geometrieBandeau(1920, 3, 100);
    expect(bas.y + bas.hBande).toBe(1920);
  });

  it("donne la taille de la vidéo selon la résolution demandée", () => {
    expect(tailleSelonResolution("480p")).toEqual({ largeur: 480, hauteur: 854 });
    expect(tailleSelonResolution("720p")).toEqual({ largeur: 720, hauteur: 1280 });
    expect(tailleSelonResolution("1080p")).toEqual({ largeur: 1080, hauteur: 1920 });
  });
});
