// Une vraie capture de micabo incrustée dans l'écran d'un appareil qui est
// sur une photo de la banque (iPad posé sur un bureau) : l'écran de la photo
// est un quadrilatère (4 coins relevés à la main), la capture y est posée en
// perspective, à la lumière de la photo. Ce qui est posé SUR l'écran (un
// crayon, un reflet clair) reste devant.

import { type Canvas, createCanvas, type Image } from "@napi-rs/canvas";

export type Point = [number, number];

/** L'écran d'un appareil sur la photo, en pixels de la photo d'origine. */
export type EcranPhoto = {
  /** Haut gauche, haut droit, bas droit, bas gauche (sens de l'écran, pas de la photo). */
  coins: [Point, Point, Point, Point];
  /** La capture de micabo, chemin depuis le dossier du pod. */
  capture: string;
  /** « ipad-paysage » : une capture d'iPhone au centre d'un écran d'iPad couché, fond prolongé ; « plein » : la capture telle quelle (le site sur un ordinateur). */
  gabarit: "ipad-paysage" | "plein";
  /** Luminosité de l'écran dans la photo (0,8 : un écran rendu un peu plus sombre que le papier). */
  lumiere?: number;
  /** Au-dessus de ce gris (0..255) dans la photo, l'objet posé sur l'écran reste devant (le crayon). */
  devant?: number;
};

/** L'écran d'un iPad couché (2360 × 1640), avec la capture d'iPhone au centre et son fond prolongé. */
export function gabaritIpadPaysage(capture: Image) {
  const L = 2360;
  const H = 1640;
  // Sans la barre d'état ni la barre d'accueil de l'iPhone.
  const y0 = Math.round(capture.height * 0.06);
  const y1 = Math.round(capture.height * 0.965);
  const s = H / (y1 - y0);
  const l = Math.round(capture.width * s);
  const x = Math.round((L - l) / 2);
  const c = createCanvas(L, H);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  // Le fond prolongé : chaque ligne reprend la couleur de son bord.
  for (let y = 0; y < H; y++) {
    const sy = y0 + y / s;
    ctx.drawImage(capture, 1, sy, 1, 1 / s, 0, y, x + 2, 1);
    ctx.drawImage(capture, capture.width - 2, sy, 1, 1 / s, x + l - 2, y, L - x - l + 2, 1);
  }
  ctx.drawImage(capture, 0, y0, capture.width, y1 - y0, x, 0, l, H);
  return c;
}

/** La capture telle quelle, sur toute la surface de l'écran. */
export function pleinEcran(capture: Image) {
  const c = createCanvas(capture.width, capture.height);
  c.getContext("2d").drawImage(capture, 0, 0);
  return c;
}

/** L'homographie qui envoie le carré unité (0,0)(1,0)(1,1)(0,1) sur les 4 coins. */
function homographie([p0, p1, p2, p3]: [Point, Point, Point, Point]) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h] as const;
}

/** Inverse : d'un point de la photo vers (u, v) dans l'écran (0..1). */
function inverse(m: ReturnType<typeof homographie>) {
  const [a, b, c, d, e, f, g, h] = m;
  const A = e - f * h;
  const B = c * h - b;
  const C = b * f - c * e;
  const D = f * g - d;
  const E = a - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const Hh = b * g - a * h;
  const I = a * e - b * d;
  return (x: number, y: number): Point => {
    const w = G * x + Hh * y + I;
    return [(A * x + B * y + C) / w, (D * x + E * y + F) / w];
  };
}

/** La photo, avec la capture incrustée dans son écran. Rend un canvas de la taille de la photo. */
export function incruster(photo: Image | Canvas, ecran: EcranPhoto, contenu: { width: number; height: number; data: Uint8ClampedArray }) {
  const c = createCanvas(photo.width, photo.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(photo, 0, 0);
  // Les coins rentrés d'un pixel vers le centre, pour ne pas mordre sur le bord noir.
  const cx = ecran.coins.reduce((s, p) => s + p[0], 0) / 4;
  const cy = ecran.coins.reduce((s, p) => s + p[1], 0) / 4;
  const coins = ecran.coins.map(([x, y]) => [x + (cx - x) * 0.004, y + (cy - y) * 0.004]) as [Point, Point, Point, Point];
  const vers = inverse(homographie(coins));
  const xs = coins.map((p) => p[0]);
  const ys = coins.map((p) => p[1]);
  const bx = Math.floor(Math.min(...xs));
  const by = Math.floor(Math.min(...ys));
  const bl = Math.ceil(Math.max(...xs)) - bx + 1;
  const bh = Math.ceil(Math.max(...ys)) - by + 1;
  const img = ctx.getImageData(bx, by, bl, bh);
  const p = img.data;
  const { width: cl, height: ch, data: q } = contenu;
  const lumiere = ecran.lumiere ?? 0.8;
  const devant = ecran.devant ?? 172;
  // Coins arrondis de l'écran : 2,5 % de sa largeur (aucun sur un écran d'ordinateur).
  const r = ecran.gabarit === "plein" ? 0.0001 : 0.025;
  const rv = (r * cl) / ch;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bl; x++) {
      const [u, v] = vers(bx + x + 0.5, by + y + 0.5);
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const du = Math.max(0, r - u, u - (1 - r)) / r;
      const dv = Math.max(0, rv - v, v - (1 - rv)) / rv;
      if (du > 0 && dv > 0 && du * du + dv * dv > 1) continue;
      const i = (y * bl + x) * 4;
      const gris = (p[i] + p[i + 1] + p[i + 2]) / 3;
      // Le crayon, plus clair que l'écran éteint de la photo, reste devant (fondu sur 24 niveaux).
      const garde = Math.min(1, Math.max(0, (gris - devant) / 24));
      // Échantillon bilinéaire du contenu.
      const fx = u * (cl - 1);
      const fy = v * (ch - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const x1 = Math.min(cl - 1, x0 + 1);
      const y1 = Math.min(ch - 1, y0 + 1);
      for (let k = 0; k < 3; k++) {
        const val =
          q[(y0 * cl + x0) * 4 + k] * (1 - tx) * (1 - ty) +
          q[(y0 * cl + x1) * 4 + k] * tx * (1 - ty) +
          q[(y1 * cl + x0) * 4 + k] * (1 - tx) * ty +
          q[(y1 * cl + x1) * 4 + k] * tx * ty;
        p[i + k] = Math.round(p[i + k] * garde + val * lumiere * (1 - garde));
      }
    }
  }
  ctx.putImageData(img, bx, by);
  return c;
}
