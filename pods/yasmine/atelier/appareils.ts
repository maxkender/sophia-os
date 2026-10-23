// Les appareils dessinés : l'iPad de ses slides de notes (même place, même
// taille, crayon à droite) et un iPhone pour les vraies captures de micabo.

import type { Image } from "@napi-rs/canvas";
import { type Ctx, rectArrondi, sansOmbre } from "./dessin.ts";

/** L'iPad, mesuré sur ses slides (1080 × 1920). */
export const IPAD = { x: 153, y: 357, l: 774, h: 1075, r: 76 } as const;
/** L'écran de l'iPad. Les notes se dessinent dans ce repère (0..696 × 0..997). */
export const ECRAN = { x: 192, y: 396, l: 696, h: 997, r: 22 } as const;

/** Papier quadrillé de GoodNotes : un carreau très clair tous les 22 px. */
function quadrillage(ctx: Ctx) {
  ctx.save();
  ctx.strokeStyle = "rgba(20,30,60,0.055)";
  ctx.lineWidth = 1;
  for (let x = 11; x < ECRAN.l; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, ECRAN.h);
    ctx.stroke();
  }
  for (let y = 11; y < ECRAN.h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(ECRAN.l, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** L'Apple Pencil posé contre le bord droit, pointe en haut. */
function crayon(ctx: Ctx) {
  const x = 930;
  const l = 33;
  const y0 = 541;
  const y1 = 1262;
  const cone = 44;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.moveTo(x + l / 2, y0);
  ctx.bezierCurveTo(x + l * 0.62, y0 + 6, x + l, y0 + cone * 0.75, x + l, y0 + cone);
  ctx.lineTo(x + l, y1 - l / 2);
  ctx.arc(x + l / 2, y1 - l / 2, l / 2, 0, Math.PI);
  ctx.lineTo(x, y0 + cone);
  ctx.bezierCurveTo(x, y0 + cone * 0.75, x + l * 0.38, y0 + 6, x + l / 2, y0);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, 0, x + l, 0);
  g.addColorStop(0, "#e2e2e4");
  g.addColorStop(0.3, "#ffffff");
  g.addColorStop(0.62, "#f6f6f7");
  g.addColorStop(1, "#c9c9cc");
  ctx.fillStyle = g;
  ctx.fill();
  sansOmbre(ctx);
  // La pointe grise, et la bague où commence le corps.
  ctx.beginPath();
  ctx.moveTo(x + l / 2, y0);
  ctx.bezierCurveTo(x + l * 0.56, y0 + 3, x + l * 0.66, y0 + 9, x + l * 0.7, y0 + 13);
  ctx.lineTo(x + l * 0.3, y0 + 13);
  ctx.bezierCurveTo(x + l * 0.34, y0 + 9, x + l * 0.44, y0 + 3, x + l / 2, y0);
  ctx.fillStyle = "#b9b9bd";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 2, y0 + cone + 1);
  ctx.lineTo(x + l - 2, y0 + cone + 1);
  ctx.stroke();
  ctx.restore();
}

/**
 * L'iPad avec son écran. `ecran` dessine dans le repère de l'écran
 * (0..696 × 0..997), déjà découpé et quadrillé.
 */
export function ipad(ctx: Ctx, ecran: (ctx: Ctx) => void) {
  ctx.save();
  // Le boîtier : noir, ombre douce, bord argenté.
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 10;
  rectArrondi(ctx, IPAD.x, IPAD.y, IPAD.l, IPAD.h, IPAD.r);
  ctx.fillStyle = "#131313";
  ctx.fill();
  sansOmbre(ctx);
  const g = ctx.createLinearGradient(IPAD.x, IPAD.y, IPAD.x + IPAD.l, IPAD.y + IPAD.h);
  g.addColorStop(0, "#c9cacd");
  g.addColorStop(0.45, "#8d8e91");
  g.addColorStop(1, "#b4b5b8");
  rectArrondi(ctx, IPAD.x + 1.5, IPAD.y + 1.5, IPAD.l - 3, IPAD.h - 3, IPAD.r - 1.5);
  ctx.strokeStyle = g;
  ctx.lineWidth = 3;
  ctx.stroke();
  rectArrondi(ctx, IPAD.x + 4, IPAD.y + 4, IPAD.l - 8, IPAD.h - 8, IPAD.r - 4);
  ctx.strokeStyle = "#2b2b2d";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // La caméra et ses capteurs, dans le bord du haut.
  const cy = IPAD.y + 19;
  for (const [cx, r, c] of [
    [481, 6, "#232325"],
    [511, 8, "#1d1d20"],
    [540, 3.5, "#1f2a3a"],
    [570, 3, "#202022"],
    [598, 7, "#212123"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  }
  // L'écran.
  ctx.save();
  rectArrondi(ctx, ECRAN.x, ECRAN.y, ECRAN.l, ECRAN.h, ECRAN.r);
  ctx.clip();
  ctx.fillStyle = "#fefefe";
  ctx.fillRect(ECRAN.x, ECRAN.y, ECRAN.l, ECRAN.h);
  ctx.translate(ECRAN.x, ECRAN.y);
  quadrillage(ctx);
  ecran(ctx);
  ctx.restore();
  crayon(ctx);
  ctx.restore();
}

/** Où poser l'iPhone : centre, haut du boîtier, largeur de l'écran. */
export type PlaceIphone = { cx?: number; haut?: number; largeur?: number };

/**
 * Un iPhone (bords fins, Dynamic Island) qui montre une capture d'écran
 * entière. La capture garde ses proportions (739 × 1600 pour micabo).
 * Rend la boîte du boîtier, pour caler les légendes.
 */
export function iphone(ctx: Ctx, capture: Image, place: PlaceIphone = {}) {
  const le = place.largeur ?? 520;
  const he = Math.round((le * capture.height) / capture.width);
  const bord = 15;
  const l = le + 2 * bord;
  const h = he + 2 * bord;
  const x = Math.round((place.cx ?? 540) - l / 2);
  const y = place.haut ?? 330;
  const r = Math.round(l * 0.155);
  ctx.save();
  // Les boutons, sous le boîtier.
  ctx.fillStyle = "#3a3a3d";
  const bouton = (bx: number, by: number, bh: number) => {
    rectArrondi(ctx, bx, by, 6, bh, 3);
    ctx.fill();
  };
  bouton(x - 4, y + h * 0.17, h * 0.045);
  bouton(x - 4, y + h * 0.245, h * 0.08);
  bouton(x - 4, y + h * 0.345, h * 0.08);
  bouton(x + l - 2, y + h * 0.27, h * 0.12);
  // Le boîtier.
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  rectArrondi(ctx, x, y, l, h, r);
  ctx.fillStyle = "#1c1c1e";
  ctx.fill();
  sansOmbre(ctx);
  const g = ctx.createLinearGradient(x, y, x + l, y + h);
  g.addColorStop(0, "#9b9ca0");
  g.addColorStop(0.5, "#56575b");
  g.addColorStop(1, "#8a8b8f");
  rectArrondi(ctx, x + 1, y + 1, l - 2, h - 2, r - 1);
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  rectArrondi(ctx, x + 4, y + 4, l - 8, h - 8, r - 4);
  ctx.fillStyle = "#050505";
  ctx.fill();
  // L'écran : la capture entière.
  ctx.save();
  rectArrondi(ctx, x + bord, y + bord, le, he, r - bord + 2);
  ctx.clip();
  ctx.drawImage(capture, x + bord, y + bord, le, he);
  ctx.restore();
  // La Dynamic Island, sur la ligne de l'heure comme sur un vrai iPhone.
  const il = Math.round(le * 0.235);
  const ih = Math.round(le * 0.068);
  rectArrondi(ctx, x + l / 2 - il / 2, y + bord + Math.round(le * 0.028), il, ih, ih / 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();
  return { x, y, l, h };
}
