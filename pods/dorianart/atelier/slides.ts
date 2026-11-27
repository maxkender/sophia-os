// Le rendu des slides du podz 34, au format des icebergs de @dorian.frog
// (« Iceberg of Autistic hobbies », « Iceberg of ADHD hobbies » ; mesuré sur
// ses slides de 1080 × 1440, relevé du 27/11), SANS IA :
// - la couverture : SA couverture (assets/iceberg-couverture.jpg : son
//   iceberg dans l'ovale sur le bleu nuit, son texte effacé en repeignant
//   l'aplat), « Iceberg of » en Inter Regular 120 px, base y 211, et le
//   titre (« ADHD hobbies ») en 112 px, base y 1 226, une note facultative
//   (« *requested update ») en 28 px dessous ;
// - l'iceberg : un iceberg en facettes DESSINÉ PAR CODE (sa silhouette, ses
//   bleus, sur son gris clair #EEF0ED), ses traits d'étage blancs à y 354,
//   609, 867 et 1 125 (de x 89 à 992), jusqu'à 4 loisirs par étage (4, 4, 4,
//   3, 1 chez lui), chacun en objet détouré (un vrai objet du Met, `npm run
//   objet`) posé sur son nom (Inter Regular 34 px, deux lignes au plus), et
//   « disagreed? » en 40 px en bas à gauche ;
// - le loisir Artura : le LOGO d'Artura à la place de l'objet, et son nom
//   qui la cite (« art history on artura ») ; jamais une capture.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1440;

const FOND = "#EEF0ED";
const ICONE_ARTURA = "assets/artura/icone.png";
const ICE = {
  haut: { base: 211, taille: 120 },
  bas: { base: 1226, taille: 112 },
  note: { taille: 28, ecart: 52 },
  traits: [354, 609, 867, 1125],
  x0: 89,
  x1: 992,
  hautPremier: 40,
  objet: 160,
  etiquette: 34,
  basDernier: 1330,
  question: { x: 32, base: 1345, taille: 40 },
} as const;

/** Un loisir : son nom (en minuscules, comme chez lui) et son objet détouré (images/objets/….png), ou "artura" (le logo). */
export type Loisir = { t: string; image: string };
export type CouvertureIceberg = { haut: string; bas: string; note?: string };
export type Iceberg = { etages: Loisir[][]; question?: string };
export type TypeSlide = "iceberg_couverture" | "iceberg";
export type Slide = { type: TypeSlide; [langue: string]: unknown };
export type Source = { musee: string; id: string; titre: string; artiste: string; date: string; url: string };

export type Post = {
  id: string;
  /** Son iceberg qui sert de preuve (format et sujet qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Les objets et œuvres utilisés : chemin local → fiche du musée. */
  oeuvres?: Record<string, Source>;
  slides: Slide[];
  type_bleo?: "full_test" | "declinaison";
  parent_contenu_id?: string;
};

export function lirePost(id: string): Post {
  return JSON.parse(readFileSync(join(RACINE, "posts", `${id}.json`), "utf8")) as Post;
}
export function contenu<T>(s: Slide, langue: string): T {
  return s[langue] as T;
}
export function languesCompletes(post: Post): string[] {
  return Object.keys(post.titre).filter((l) => post.legendes[l] && post.slides.every((s) => s[l]));
}
/** Les loisirs de l'iceberg, dans une langue (l'anglais, langue source, par défaut). */
export const loisirs = (s: Slide, langue = "en"): Loisir[] => {
  const c = contenu<Iceberg>(s, langue);
  return s.type === "iceberg" && c?.etages ? c.etages.flat() : [];
};
/** La slide de l'appli, que l'OS marque `position_app: "artura"` : l'iceberg qui porte le loisir Artura. */
export const estSlideApp = (s: Slide) => loisirs(s).some((h) => h.image === "artura");
export const photosSlide = (s: Slide): string[] => loisirs(s).map((h) => h.image).filter((i) => i !== "artura");
export function textesSlide(s: Slide, langue: string): string {
  if (s.type === "iceberg_couverture") {
    const c = contenu<CouvertureIceberg>(s, langue);
    return [c.haut, c.bas, c.note].filter(Boolean).join(" ");
  }
  const c = contenu<Iceberg>(s, langue);
  return [...c.etages.flat().map((h) => h.t), c.question].filter(Boolean).join(" — ");
}

// ---------------------------------------------------------------------------

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

const cache = new Map<string, Image>();
async function image(chemin: string): Promise<Image> {
  const f = join(RACINE, chemin);
  if (!existsSync(f)) throw new Error(`image introuvable : ${chemin}`);
  if (!cache.has(f)) cache.set(f, await loadImage(f));
  return cache.get(f)!;
}

function rectArrondi(ctx: Ctx, x: number, y: number, l: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

function couper(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes: string[] = [];
  let cur = "";
  for (const m of t.split(/\s+/).filter(Boolean)) {
    const essai = cur ? `${cur} ${m}` : m;
    if (cur && ctx.measureText(essai).width > largeur) (lignes.push(cur), (cur = m));
    else cur = essai;
  }
  if (cur) lignes.push(cur);
  return lignes;
}

// --- L'iceberg en facettes, dessiné par code ---------------------------------------

/** Sa silhouette (relevée sur son iceberg) : la partie émergée, puis la partie immergée. */
const POINTE: [number, number][] = [
  [90, 352], [130, 318], [175, 300], [215, 292], [250, 262], [290, 246], [330, 214], [372, 160], [415, 108], [452, 72],
  [478, 58], [505, 70], [530, 96], [560, 130], [598, 162], [640, 190], [682, 206], [728, 226], [775, 238], [820, 252],
  [865, 272], [910, 296], [955, 322], [990, 352],
];
const CORPS: [number, number][] = [
  [70, 357], [50, 410], [38, 480], [50, 545], [42, 610], [56, 690], [64, 770], [92, 850], [118, 920], [150, 990],
  [186, 1060], [228, 1130], [270, 1195], [318, 1262], [362, 1325], [404, 1385], [440, 1430], [478, 1400], [526, 1352],
  [586, 1296], [650, 1238], [716, 1172], [786, 1098], [846, 1024], [902, 948], [952, 868], [992, 786], [1022, 700],
  [1036, 612], [1044, 528], [1036, 448], [1022, 400], [1012, 357],
];

function hasard(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const melange = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
/** La couleur d'une facette : un dégradé vertical, un peu plus claire à gauche, une variation par facette. */
function teinte(y: number, x: number, emergee: boolean, v: number): string {
  let c: number[];
  if (emergee) c = melange([255, 255, 255], [214, 234, 245], Math.min(1, Math.max(0, (y - 60) / 290)));
  else {
    const t = Math.min(1, Math.max(0, (y - 357) / 1070));
    c = t < 0.5 ? melange([191, 228, 243], [140, 195, 224], t * 2) : melange([140, 195, 224], [95, 157, 198], (t - 0.5) * 2);
  }
  const lumiere = 1 + (0.5 - x / L) * 0.06 + v;
  return `rgb(${c.map((k) => Math.round(Math.max(0, Math.min(255, k * lumiere)))).join(",")})`;
}

function chemin(ctx: Ctx, pts: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
}

function facettes(ctx: Ctx, pts: [number, number][], emergee: boolean, graine: number) {
  const alea = hasard(graine);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 70, Math.max(...xs) + 70, Math.min(...ys) - 70, Math.max(...ys) + 70];
  const pas = emergee ? 48 : 70;
  const nx = Math.ceil((x1 - x0) / pas) + 1, ny = Math.ceil((y1 - y0) / pas) + 1;
  const grille: [number, number][][] = [];
  for (let j = 0; j < ny; j++) {
    grille.push([]);
    for (let i = 0; i < nx; i++) grille[j].push([x0 + i * pas + (alea() - 0.5) * pas * 0.55, y0 + j * pas + (alea() - 0.5) * pas * 0.55]);
  }
  ctx.save();
  chemin(ctx, pts);
  ctx.clip();
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = grille[j][i], b = grille[j][i + 1], c = grille[j + 1][i + 1], d = grille[j + 1][i];
      const tris = (i + j) % 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const t of tris) {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const couleur = teinte(cy, cx, emergee, (alea() - 0.5) * (emergee ? 0.07 : 0.11));
        ctx.beginPath();
        ctx.moveTo(t[0][0], t[0][1]);
        ctx.lineTo(t[1][0], t[1][1]);
        ctx.lineTo(t[2][0], t[2][1]);
        ctx.closePath();
        ctx.fillStyle = couleur;
        ctx.strokeStyle = couleur;
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
      }
    }
  ctx.restore();
  ctx.save();
  chemin(ctx, pts);
  ctx.strokeStyle = emergee ? "rgba(170,205,225,0.9)" : "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function dessinerIceberg(ctx: Ctx) {
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, L, H);
  facettes(ctx, CORPS, false, 34);
  facettes(ctx, POINTE, true, 7);
  // La ligne d'eau.
  ctx.fillStyle = "rgba(150,200,225,0.55)";
  ctx.fillRect(56, 352, 976, 6);
}

// --- Les slides ------------------------------------------------------------------------

async function icone(ctx: Ctx, x: number, y: number, cote: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  rectArrondi(ctx, x, y, cote, cote, cote * 0.225);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  rectArrondi(ctx, x, y, cote, cote, cote * 0.225);
  ctx.clip();
  ctx.drawImage(await image(ICONE_ARTURA), x, y, cote, cote);
  ctx.restore();
}

async function icebergCouverture(ctx: Ctx, c: CouvertureIceberg) {
  ctx.drawImage(await image("assets/iceberg-couverture.jpg"), 0, 0, L, H);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  for (const [t, o] of [[c.haut, ICE.haut], [c.bas, ICE.bas]] as const) {
    let s: number = o.taille;
    ctx.font = `${s}px "${POLICE.iceberg}"`;
    while (ctx.measureText(t).width > 980 && s > 50) ctx.font = `${(s -= 2)}px "${POLICE.iceberg}"`;
    ctx.fillText(t, L / 2, o.base);
  }
  if (c.note) {
    ctx.font = `${ICE.note.taille}px "${POLICE.iceberg}"`;
    ctx.fillText(c.note, L / 2, ICE.bas.base + ICE.note.ecart);
  }
}

async function iceberg(ctx: Ctx, c: Iceberg) {
  dessinerIceberg(ctx);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  for (const y of ICE.traits) {
    ctx.beginPath();
    ctx.moveTo(ICE.x0, y);
    ctx.lineTo(ICE.x1, y);
    ctx.stroke();
  }
  if (c.etages.length > ICE.traits.length + 1) throw new Error(`iceberg : ${ICE.traits.length + 1} étages au plus`);
  const bornes = [ICE.hautPremier, ...ICE.traits, ICE.basDernier];
  for (const [i, etage] of c.etages.entries()) {
    if (etage.length > 4) throw new Error(`iceberg : 4 loisirs par étage au plus (étage ${i + 1})`);
    const haut = bornes[i] + 14;
    const bas = bornes[i + 1] - 22;
    const pas = (ICE.x1 - ICE.x0) / etage.length;
    for (const [j, h] of etage.entries()) {
      const cx = ICE.x0 + pas * (j + 0.5);
      ctx.font = `${ICE.etiquette}px "${POLICE.iceberg}"`;
      const lignes = couper(ctx, h.t, Math.min(pas - 10, 240));
      if (lignes.length > 2) throw new Error(`iceberg : « ${h.t} » tient sur deux lignes au plus`);
      const hauteurTexte = lignes.length * ICE.etiquette * 0.98;
      const basImage = bas - hauteurTexte - 4;
      const place = Math.min(ICE.objet, basImage - haut);
      const largeur = Math.min(pas - 24, 210);
      if (h.image === "artura") await icone(ctx, cx - place * 0.42, basImage - place * 0.84, place * 0.84);
      else {
        const img = await image(h.image);
        const kk = Math.min(largeur / img.width, place / img.height);
        ctx.drawImage(img, cx - (img.width * kk) / 2, basImage - img.height * kk, img.width * kk, img.height * kk);
      }
      ctx.fillStyle = "#0a0a0a";
      ctx.textAlign = "center";
      lignes.forEach((l, n) => ctx.fillText(l, cx, bas - (lignes.length - 1 - n) * ICE.etiquette * 0.98));
    }
  }
  if (c.question) {
    ctx.font = `${ICE.question.taille}px "${POLICE.iceberg}"`;
    ctx.fillStyle = "#0a0a0a";
    ctx.textAlign = "left";
    ctx.fillText(c.question, ICE.question.x, ICE.question.base);
  }
}

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "iceberg_couverture") await icebergCouverture(ctx, c as CouvertureIceberg);
  else if (s.type === "iceberg") await iceberg(ctx, c as Iceberg);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
