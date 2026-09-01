/** Copie Deno de src/features/moteur/papierCompose.ts — garder synchro. */

export const PAPIER_CANVAS_W = 1080;
export const PAPIER_CANVAS_H = 1920;
export const PAPIER_CANVAS_BG = "#000000";
export const PAPIER_SQUARE = 1040;
export const PAPIER_SQUARE_X = 20;
export const PAPIER_SQUARE_Y = 440;
export const PAPIER_SQUARE_R = 48;

export function pointDansFenetre1x1(x: number, y: number): boolean {
  const rx = PAPIER_SQUARE_X;
  const ry = PAPIER_SQUARE_Y;
  const s = PAPIER_SQUARE;
  const r = PAPIER_SQUARE_R;
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

export function alphaMasquePapier(x: number, y: number): number {
  return pointDansFenetre1x1(x, y) ? 0 : 255;
}
