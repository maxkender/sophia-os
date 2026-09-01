import { describe, expect, it } from "vitest";

import {
  PAPIER_CANVAS_H,
  PAPIER_CANVAS_W,
  PAPIER_SQUARE,
  PAPIER_SQUARE_R,
  PAPIER_SQUARE_X,
  PAPIER_SQUARE_Y,
  alphaMasquePapier,
  cssFenetrePapier,
  pointDansFenetre1x1,
} from "./papierCompose";

describe("composition papier 9:16", () => {
  it("place le carré 1040 à x=20 y=440 sur 1080×1920", () => {
    expect(PAPIER_CANVAS_W).toBe(1080);
    expect(PAPIER_CANVAS_H).toBe(1920);
    expect(PAPIER_SQUARE).toBe(1040);
    expect(PAPIER_SQUARE_X).toBe(20);
    expect(PAPIER_SQUARE_Y).toBe(440);
    expect(PAPIER_SQUARE_X * 2 + PAPIER_SQUARE).toBe(PAPIER_CANVAS_W);
    expect(PAPIER_SQUARE_Y).toBe((PAPIER_CANVAS_H - PAPIER_SQUARE) / 2);
    expect(PAPIER_SQUARE_R).toBe(48);
  });

  it("le masque est noir hors de la fenêtre, transparent dedans", () => {
    expect(pointDansFenetre1x1(540, 960)).toBe(true);
    expect(alphaMasquePapier(540, 960)).toBe(0);
    expect(pointDansFenetre1x1(10, 960)).toBe(false);
    expect(alphaMasquePapier(10, 960)).toBe(255);
    expect(pointDansFenetre1x1(540, 10)).toBe(false);
    expect(alphaMasquePapier(540, 10)).toBe(255);
  });

  it("clippe les coins au rayon 48 sans déborder du carré", () => {
    expect(pointDansFenetre1x1(PAPIER_SQUARE_X + 1, PAPIER_SQUARE_Y + 1)).toBe(false);
    expect(pointDansFenetre1x1(PAPIER_SQUARE_X + 48, PAPIER_SQUARE_Y + 48)).toBe(true);
    expect(pointDansFenetre1x1(PAPIER_SQUARE_X + 1039, PAPIER_SQUARE_Y + 1)).toBe(false);
  });

  it("expose le CSS preview aligné sur le canvas", () => {
    const css = cssFenetrePapier();
    expect(parseFloat(css.left)).toBeCloseTo((20 / 1080) * 100, 5);
    expect(parseFloat(css.top)).toBeCloseTo((440 / 1920) * 100, 5);
    expect(parseFloat(css.width)).toBeCloseTo((1040 / 1080) * 100, 5);
  });
});
