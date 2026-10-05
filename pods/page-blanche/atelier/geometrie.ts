// Détection de la géométrie d'une slide « page blanche » : où sont les lignes de
// texte, comment elles se regroupent en blocs, et où sont les images (photos,
// logos, captures d'app, emojis). Aucune IA : on lit les pixels.
//
// Principe : une grille de cellules de CELLULE px, « encrée » si un pixel n'est
// pas blanc. On dilate horizontalement (pour souder les mots d'une ligne, pas
// les colonnes voisines), on prend les composantes connexes, puis on classe :
// une composante basse et peu dense = une ligne de texte, le reste = une image.

import { loadImage, createCanvas } from "@napi-rs/canvas";

export type Boite = { x: number; y: number; l: number; h: number };

export type Ligne = Boite & {
  /** Bas de l'encre hors jambages/soulignement, estimé au profil vertical. */
  base: number;
};

export type ElementGeo =
  | { id: string; type: "texte"; boite: Boite; lignes: Ligne[]; pas: number; alignement: Alignement }
  | { id: string; type: "image"; boite: Boite };

export type Alignement = "gauche" | "droite" | "centre";

export type GeometrieSlide = {
  largeur: number;
  hauteur: number;
  fond: string;
  encre: string;
  elements: ElementGeo[];
};

const CELLULE = 4;
const SEUIL_ENCRE = 200; // min(r,g,b) en dessous = encre (texte noir, photo)
const SEUIL_NON_BLANC = 236;

export async function analyserSlide(chemin: string): Promise<GeometrieSlide> {
  const img = await loadImage(chemin);
  const L = img.width;
  const H = img.height;
  const c = createCanvas(L, H);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, L, H).data;

  const minRGB = (x: number, y: number) => {
    const i = (y * L + x) * 4;
    return Math.min(px[i], px[i + 1], px[i + 2]);
  };

  // 1) Images : zones DENSES (photos, captures). Le texte n'atteint jamais 50 %
  // d'encre sur une cellule de 12 px ; une photo, si. On part des cellules
  // denses, puis on étend chaque rectangle tant que son bord reste non blanc.
  const images = detecterImages(L, H, minRGB);
  const masque = (x: number, y: number) =>
    images.some((b) => x >= b.x - 2 && x < b.x + b.l + 2 && y >= b.y - 2 && y < b.y + b.h + 2);

  // 2) Lignes de texte sur le reste : grille encrée, dilatée horizontalement.
  const GL = Math.ceil(L / CELLULE);
  const GH = Math.ceil(H / CELLULE);
  const grille = new Uint8Array(GL * GH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      if (minRGB(x, y) < SEUIL_NON_BLANC && !masque(x, y)) grille[Math.floor(y / CELLULE) * GL + Math.floor(x / CELLULE)] = 1;
    }
  }
  const R = 3;
  const dil = new Uint8Array(GL * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GL; gx++) {
      if (!grille[gy * GL + gx]) continue;
      for (let d = -R; d <= R; d++) {
        const nx = gx + d;
        if (nx >= 0 && nx < GL) dil[gy * GL + nx] = 1;
      }
    }
  }
  const comps = composantes(dil, GL, GH);

  type Comp = Boite & { densite: number; couleur: number };
  const boites: Comp[] = [];
  for (const b of comps) {
    let x0 = L, y0 = H, x1 = -1, y1 = -1, n = 0, couleur = 0;
    for (let y = b.y0 * CELLULE; y < Math.min(H, (b.y1 + 1) * CELLULE); y++) {
      for (let x = Math.max(0, b.x0 * CELLULE); x < Math.min(L, (b.x1 + 1) * CELLULE); x++) {
        if (masque(x, y)) continue;
        const i = (y * L + x) * 4;
        const m = Math.min(px[i], px[i + 1], px[i + 2]);
        if (m < SEUIL_NON_BLANC) {
          n++;
          if (Math.max(px[i], px[i + 1], px[i + 2]) - m > 70) couleur++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0 || n < 6) continue;
    const l = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    boites.push({ x: x0, y: y0, l, h, densite: n / (l * h), couleur: couleur / n });
  }

  // Classement : une ligne de texte est basse, noire et clairsemée. Un élément
  // coloré (emoji, logo) ou trop haut (logo au trait) est une image.
  const lignes: Ligne[] = [];
  const miettes: Comp[] = [];
  for (const b of boites) {
    const petit = b.h < 16 && b.l < 40; // point d'un i, accent, bout de soulignement
    const trait = b.h <= 6; // soulignement isolé
    if (petit || trait) miettes.push(b);
    else if (b.couleur > 0.25 || b.h > 80) images.push({ x: b.x, y: b.y, l: b.l, h: b.h });
    else lignes.push({ x: b.x, y: b.y, l: b.l, h: b.h, base: baseLigne(b, minRGB) });
  }
  // Les miettes rejoignent la ligne la plus proche qu'elles chevauchent.
  for (const m of miettes) {
    let best: Ligne | null = null;
    let dist = 18;
    for (const li of lignes) {
      const chevauche = m.x < li.x + li.l + 6 && m.x + m.l > li.x - 6;
      if (!chevauche) continue;
      const d = m.y > li.y + li.h ? m.y - (li.y + li.h) : li.y > m.y + m.h ? li.y - (m.y + m.h) : 0;
      if (d < dist) {
        dist = d;
        best = li;
      }
    }
    if (best) {
      const x1 = Math.max(best.x + best.l, m.x + m.l);
      const y1 = Math.max(best.y + best.h, m.y + m.h);
      best.x = Math.min(best.x, m.x);
      best.y = Math.min(best.y, m.y);
      best.l = x1 - best.x;
      best.h = y1 - best.y;
    }
  }
  const lignesLibres = lignes;

  // Regroupement des lignes en blocs : même marge (gauche, droite ou centre) et
  // écart vertical inférieur à ~0,9 hauteur de ligne.
  lignesLibres.sort((a, b) => a.y - b.y || a.x - b.x);
  const blocs: Ligne[][] = [];
  for (const li of lignesLibres) {
    const cible = blocs.find((bl) => {
      const der = bl[bl.length - 1];
      const ecart = li.y - (der.y + der.h);
      const hauteurRef = Math.max(24, Math.min(der.h, li.h));
      if (ecart < -4 || ecart > hauteurRef * 0.9) return false;
      const memeGauche = Math.abs(li.x - der.x) < 14;
      const memeDroite = Math.abs(li.x + li.l - (der.x + der.l)) < 14;
      const memeCentre = Math.abs(li.x + li.l / 2 - (der.x + der.l / 2)) < 14;
      return memeGauche || memeDroite || memeCentre;
    });
    if (cible) cible.push(li);
    else blocs.push([li]);
  }

  const elements: ElementGeo[] = [];
  const tous: ({ y: number; x: number } & ({ t: "texte"; lignes: Ligne[] } | { t: "image"; b: Boite }))[] = [
    ...blocs.map((ls) => ({ t: "texte" as const, lignes: ls, y: ls[0].y, x: ls[0].x })),
    ...images.map((b) => ({ t: "image" as const, b, y: b.y, x: b.x })),
  ];
  tous.sort((a, b) => a.y - b.y || a.x - b.x);
  let nT = 0;
  let nI = 0;
  for (const e of tous) {
    if (e.t === "image") {
      elements.push({ id: `I${++nI}`, type: "image", boite: e.b });
    } else {
      const ls = e.lignes;
      const x0 = Math.min(...ls.map((l) => l.x));
      const y0 = Math.min(...ls.map((l) => l.y));
      const x1 = Math.max(...ls.map((l) => l.x + l.l));
      const y1 = Math.max(...ls.map((l) => l.y + l.h));
      const pas = ls.length > 1 ? mediane(ls.slice(1).map((l, i) => l.base - ls[i].base)) : 0;
      elements.push({ id: `T${++nT}`, type: "texte", boite: { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }, lignes: ls, pas, alignement: alignementDe(ls, L) });
    }
  }

  return { largeur: L, hauteur: H, fond: couleurFond(px, L, H), encre: "#000000", elements };
}

function baseLigne(b: Boite, minRGB: (x: number, y: number) => number): number {
  // Profil vertical de l'encre sombre : la ligne de base est la dernière rangée
  // « pleine » avant la chute (jambages et soulignement sont clairsemés ou fins).
  const profil: number[] = [];
  for (let y = b.y; y < b.y + b.h; y++) {
    let n = 0;
    for (let x = b.x; x < b.x + b.l; x++) if (minRGB(x, y) < SEUIL_ENCRE) n++;
    profil.push(n);
  }
  const max = Math.max(...profil);
  let base = b.y + b.h - 1;
  for (let i = profil.length - 1; i >= 0; i--) {
    // une rangée de soulignement est longue mais d'1–3 px : on l'ignore si elle
    // est isolée sous un creux.
    if (profil[i] >= max * 0.35) {
      const sousCreux = i > 2 && profil[i - 1] < max * 0.2 && profil[i - 2] < max * 0.2;
      if (!sousCreux) {
        base = b.y + i;
        break;
      }
    }
  }
  return base;
}

function alignementDe(ls: Ligne[], L: number): Alignement {
  if (ls.length === 1) {
    const centre = ls[0].x + ls[0].l / 2;
    if (Math.abs(centre - L / 2) < 12 && ls[0].x > 120) return "centre";
    return "gauche";
  }
  const ec = (v: number[]) => Math.max(...v) - Math.min(...v);
  const g = ec(ls.map((l) => l.x));
  const d = ec(ls.map((l) => l.x + l.l));
  const c = ec(ls.map((l) => l.x + l.l / 2));
  if (g <= 8) return "gauche";
  if (c <= 10 && c < d) return "centre";
  if (d <= 8) return "droite";
  return "gauche";
}

function couleurFond(px: Uint8ClampedArray, L: number, H: number): string {
  const i = ((H - 3) * L + 3) * 4;
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(px[i])}${h(px[i + 1])}${h(px[i + 2])}`;
}

function mediane(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function composantes(dil: Uint8Array, GL: number, GH: number) {
  const etiquette = new Int32Array(GL * GH).fill(-1);
  const comps: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  const pile: number[] = [];
  for (let i = 0; i < GL * GH; i++) {
    if (!dil[i] || etiquette[i] >= 0) continue;
    const id = comps.length;
    const b = { x0: GL, y0: GH, x1: -1, y1: -1, n: 0 };
    etiquette[i] = id;
    pile.push(i);
    while (pile.length) {
      const j = pile.pop()!;
      const gx = j % GL;
      const gy = (j - gx) / GL;
      b.n++;
      if (gx < b.x0) b.x0 = gx;
      if (gx > b.x1) b.x1 = gx;
      if (gy < b.y0) b.y0 = gy;
      if (gy > b.y1) b.y1 = gy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= GL || ny >= GH) continue;
        const k = ny * GL + nx;
        if (dil[k] && etiquette[k] < 0) {
          etiquette[k] = id;
          pile.push(k);
        }
      }
    }
    comps.push(b);
  }
  return comps;
}

function detecterImages(L: number, H: number, minRGB: (x: number, y: number) => number): Boite[] {
  const C = 12;
  const GL = Math.floor(L / C);
  const GH = Math.floor(H / C);
  const dense = new Uint8Array(GL * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GL; gx++) {
      let n = 0;
      for (let y = gy * C; y < gy * C + C; y++) for (let x = gx * C; x < gx * C + C; x++) if (minRGB(x, y) < SEUIL_NON_BLANC) n++;
      if (n / (C * C) > 0.5) dense[gy * GL + gx] = 1;
    }
  }
  const out: Boite[] = [];
  for (const c of composantes(dense, GL, GH)) {
    if (c.n < 12) continue; // < ~1700 px² : un glyphe gras, pas une image
    let x0 = c.x0 * C, y0 = c.y0 * C, x1 = (c.x1 + 1) * C - 1, y1 = (c.y1 + 1) * C - 1;
    // Étend chaque côté tant que la bande suivante est majoritairement non blanche.
    const bandeH = (y: number) => {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (minRGB(x, y) < SEUIL_NON_BLANC) n++;
      return n / (x1 - x0 + 1);
    };
    const bandeV = (x: number) => {
      let n = 0;
      for (let y = y0; y <= y1; y++) if (minRGB(x, y) < SEUIL_NON_BLANC) n++;
      return n / (y1 - y0 + 1);
    };
    let bouge = true;
    while (bouge) {
      bouge = false;
      if (y0 > 0 && bandeH(y0 - 1) > 0.5) { y0--; bouge = true; }
      if (y1 < H - 1 && bandeH(y1 + 1) > 0.5) { y1++; bouge = true; }
      if (x0 > 0 && bandeV(x0 - 1) > 0.5) { x0--; bouge = true; }
      if (x1 < L - 1 && bandeV(x1 + 1) > 0.5) { x1++; bouge = true; }
    }
    // Resserre les côtés majoritairement blancs (la grille déborde d'une cellule).
    while (y1 > y0 && bandeH(y0) < 0.08) y0++;
    while (y1 > y0 && bandeH(y1) < 0.08) y1--;
    while (x1 > x0 && bandeV(x0) < 0.08) x0++;
    while (x1 > x0 && bandeV(x1) < 0.08) x1--;
    out.push({ x: x0, y: y0, l: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  // Fusionne les rectangles qui se chevauchent (une photo coupée par une zone claire).
  let fusion = true;
  while (fusion) {
    fusion = false;
    for (let i = 0; i < out.length && !fusion; i++) {
      for (let j = i + 1; j < out.length && !fusion; j++) {
        const a = out[i], b = out[j];
        if (a.x < b.x + b.l + 4 && b.x < a.x + a.l + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          out[i] = { x, y, l: Math.max(a.x + a.l, b.x + b.l) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
          out.splice(j, 1);
          fusion = true;
        }
      }
    }
  }
  return out;
}
