/** Géométrie du master 9:16 — canvas noir + fenêtre 1:1 arrondie. */

export const PAPIER_CANVAS_W = 1080;
export const PAPIER_CANVAS_H = 1920;
export const PAPIER_CANVAS_BG = "#000000";
export const PAPIER_SQUARE = 1040;
export const PAPIER_SQUARE_X = 20;
export const PAPIER_SQUARE_Y = 440;
export const PAPIER_SQUARE_R = 48;

export function pointDansFenetre1x1(x: number, y: number): boolean {
  const { PAPIER_SQUARE_X: rx, PAPIER_SQUARE_Y: ry, PAPIER_SQUARE: s, PAPIER_SQUARE_R: r } = {
    PAPIER_SQUARE_X,
    PAPIER_SQUARE_Y,
    PAPIER_SQUARE,
    PAPIER_SQUARE_R,
  };
  if (x < rx || x >= rx + s || y < ry || y >= ry + s) return false;
  const ix = x - rx;
  const iy = y - ry;
  if (ix >= r && ix < s - r) return true;
  if (iy >= r && iy < s - r) return true;
  const cx = ix < r ? r : s - r;
  const cy = iy < r ? r : s - r;
  const dx = ix - cx;
  const dy = iy - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 0 = trou (vidéo visible), 255 = noir opaque. */
export function alphaMasquePapier(x: number, y: number): number {
  return pointDansFenetre1x1(x, y) ? 0 : 255;
}

export function cssFenetrePapier(): {
  left: string;
  top: string;
  width: string;
  borderRadius: string;
} {
  return {
    left: `${(PAPIER_SQUARE_X / PAPIER_CANVAS_W) * 100}%`,
    top: `${(PAPIER_SQUARE_Y / PAPIER_CANVAS_H) * 100}%`,
    width: `${(PAPIER_SQUARE / PAPIER_CANVAS_W) * 100}%`,
    borderRadius: `${(PAPIER_SQUARE_R / PAPIER_SQUARE) * 100}%`,
  };
}
