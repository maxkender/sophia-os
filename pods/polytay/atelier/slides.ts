// Le rendu des slides du podz 25, au style exact de @polytay (mesuré sur ses
// slides de 1080 × 1440, relevé du 20/11) :
// - la couverture : un collage de deux ou trois photos qui se chevauchent, le
//   titre en minuscules par-dessus (TikTok Sans Medium 52 px, à gauche) ;
// - un élément : deux photos l'une sous l'autre à gauche (345 px puis 518 px
//   de large), à droite « 1. reading with a pen » (Medium 38 px) puis deux
//   paragraphes (Regular 33 px, lignes tous les 58 px), centrés sur x = 815 ;
// - la slide Sophia : un élément dont la photo du haut est le LOGO de Sophia
//   (son icône de l'App Store, coins arrondis), comme les logos de chaînes de
//   ses listes « youtube channels » ; jamais une capture de l'appli ;
// - la fin : « thank you for watching / save & follow ».

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1440;

const ENCRE = "#111111";
const ICONE_SOPHIA = "assets/sophia/icone.jpg";

export type TypeSlide = "couverture" | "element" | "sophia" | "fin";
export type Cadrage = { x?: number; y?: number };
/** Une photo d'élément : `format` paysage (4:3, par défaut), carre, portrait (3:4). */
export type Photo = { image: string; format?: "paysage" | "carre" | "portrait"; cadrage?: Cadrage };
/** Une photo de couverture, posée où on veut (elle peut déborder de la slide). */
export type PhotoCouverture = { image: string; x: number; y: number; l: number; h: number; cadrage?: Cadrage };
export type Slide = {
  type: TypeSlide;
  /** Un élément : [haut, bas] ; la slide Sophia : [bas] (le haut est son logo) ; la couverture : 2 ou 3 photos placées. */
  photos?: (Photo | PhotoCouverture)[];
  /** La couverture : le centre du titre (296 par défaut, à gauche comme chez elle) et sa première ligne. */
  titre?: { cx?: number; base?: number };
  [langue: string]: unknown;
};

export type TexteCouverture = { titre: string };
export type TexteElement = { titre: string; paragraphes: string[] };
export type TexteFin = { lignes?: [string, string] };

export type Post = {
  id: string;
  /** Le post du compte modèle qui sert de preuve (format et accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Les photos de la banque de l'OS utilisées : chemin local → id dans la médiathèque. */
  banque?: Record<string, string>;
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
/** La slide de l'appli, que l'OS marque `position_sophia`. */
export const estSlideSophia = (s: Slide) => s.type === "sophia";
export const photosSlide = (s: Slide): string[] => (s.photos ?? []).map((p) => p.image);

const FIN_DEFAUT: [string, string] = ["thank you for watching", "save & follow"];
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return (c as TexteCouverture).titre.replace(/\n/g, " ");
  if (s.type === "fin") return ((c as TexteFin).lignes ?? FIN_DEFAUT).join(" — ");
  const t = c as TexteElement;
  return [t.titre, ...t.paragraphes].join(" — ");
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

/** La boîte remplie par l'image (recadrée selon `cadrage`, au centre par défaut). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number, cadrage: Cadrage = {}) {
  const k = Math.max(l / img.width, h / img.height);
  const lw = l / k;
  const hh = h / k;
  const borne = (v: number | undefined) => Math.min(1, Math.max(0, v ?? 0.5));
  ctx.drawImage(img, (img.width - lw) * borne(cadrage.x), (img.height - hh) * borne(cadrage.y), lw, hh, x, y, l, h);
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
    if (cur && ctx.measureText(essai).width > largeur) {
      lignes.push(cur);
      cur = m;
    } else cur = essai;
  }
  if (cur) lignes.push(cur);
  return lignes;
}

// --- Un élément ---------------------------------------------------------------------

/** Ses mesures (« 1. reading with a pen ») : photo du haut 345 px de large à (130, 101),
 * photo du bas 518 px à x = 65, 44 px plus bas ; le titre Medium 38 px à y = 153 ; le
 * texte Regular 33 px 103 px plus bas, lignes tous les 58 px, 30 px de plus entre
 * deux paragraphes, sur 385 px de large, centré sur x = 815. */
const ELEMENT = {
  haut: { x: 130, y: 101, l: 345 },
  bas: { x: 65, l: 518, ecart: 44, fin: 1250 },
  colonne: { cx: 815, largeur: 385 },
  titre: { taille: 38, base: 153, pas: 50 },
  texte: { taille: 33, ecart: 103, pas: 58, entre: 30, fin: 1180 },
} as const;
const RATIOS = { paysage: 4 / 3, carre: 1, portrait: 3 / 4 } as const;

async function element(ctx: Ctx, s: Slide, c: TexteElement, sophia: boolean) {
  const photos = (s.photos ?? []) as Photo[];
  if (photos.length !== (sophia ? 1 : 2)) throw new Error(`« ${c.titre} » : ${sophia ? "une photo (le bas ; le haut est le logo de Sophia)" : "deux photos (haut, bas)"}`);
  const [haut, bas] = sophia ? [undefined, photos[0]] : photos;
  // La photo du haut, ou le logo de Sophia (carré, coins arrondis comme sur l'écran d'accueil).
  const h1 = haut ? ELEMENT.haut.l / RATIOS[haut.format ?? "paysage"] : ELEMENT.haut.l;
  if (haut) remplir(ctx, await image(haut.image), ELEMENT.haut.x, ELEMENT.haut.y, ELEMENT.haut.l, h1, haut.cadrage);
  else {
    ctx.save();
    rectArrondi(ctx, ELEMENT.haut.x, ELEMENT.haut.y, ELEMENT.haut.l, ELEMENT.haut.l, ELEMENT.haut.l * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(ICONE_SOPHIA), ELEMENT.haut.x, ELEMENT.haut.y, ELEMENT.haut.l, ELEMENT.haut.l);
    ctx.restore();
  }
  const y2 = ELEMENT.haut.y + h1 + ELEMENT.bas.ecart;
  const h2 = ELEMENT.bas.l / RATIOS[bas.format ?? "paysage"];
  if (y2 + h2 > ELEMENT.bas.fin) throw new Error(`« ${c.titre} » : les deux photos sont trop hautes (${Math.round(y2 + h2)} px) : paysage ou carre`);
  remplir(ctx, await image(bas.image), ELEMENT.bas.x, y2, ELEMENT.bas.l, h2, bas.cadrage);

  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.font = `${ELEMENT.titre.taille}px "${POLICE.titre}"`;
  const titre = couper(ctx, c.titre, ELEMENT.colonne.largeur);
  if (titre.length > 2) throw new Error(`« ${c.titre} » : le titre tient en deux lignes au plus`);
  let y: number = ELEMENT.titre.base;
  for (const [i, l] of titre.entries()) ctx.fillText(l, ELEMENT.colonne.cx, y + i * ELEMENT.titre.pas);
  y += (titre.length - 1) * ELEMENT.titre.pas + ELEMENT.texte.ecart;
  ctx.font = `${ELEMENT.texte.taille}px "${POLICE.texte}"`;
  for (const [k, p] of c.paragraphes.entries()) {
    for (const l of couper(ctx, p, ELEMENT.colonne.largeur)) {
      ctx.fillText(l, ELEMENT.colonne.cx, y);
      y += ELEMENT.texte.pas;
    }
    if (k < c.paragraphes.length - 1) y += ELEMENT.texte.entre;
  }
  if (y - ELEMENT.texte.pas > ELEMENT.texte.fin) throw new Error(`« ${c.titre} » : texte trop long (dernière ligne à y = ${y - ELEMENT.texte.pas}) : raccourcis`);
}

// --- La couverture et la fin -------------------------------------------------------

/** Ses mesures (« hobbies that make you / impossible to bore ») : la grande photo à
 * (416, 94) en 664 × 906, la seconde à (0, 870) en 648 × 535 ; le titre Medium 52 px
 * centré sur x = 296, lignes à y = 576 puis tous les 71 px. Chez elle, le titre noir
 * déborde sur une page de livre claire ; nos photos sont souvent sombres : la grande
 * part de x = 560 pour laisser le titre sur le blanc (pt-001). */
const COUV = {
  photos: [
    { x: 560, y: 94, l: 520, h: 800 },
    { x: 0, y: 850, l: 660, h: 560 },
  ],
  titre: { taille: 52, cx: 282, base: 560, pas: 71 },
} as const;

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  const photos = (s.photos ?? []) as PhotoCouverture[];
  if (photos.length < 2 || photos.length > 3) throw new Error("couverture : deux ou trois photos");
  for (const [i, p] of photos.entries()) {
    const b = { ...(COUV.photos[i] ?? {}), ...p };
    if ([b.x, b.y, b.l, b.h].some((v) => typeof v !== "number")) throw new Error(`couverture : la photo ${i + 1} a besoin de x, y, l, h`);
    remplir(ctx, await image(p.image), b.x, b.y, b.l, b.h, p.cadrage);
  }
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.font = `${COUV.titre.taille}px "${POLICE.titre}"`;
  const cx = s.titre?.cx ?? COUV.titre.cx;
  const base = s.titre?.base ?? COUV.titre.base;
  for (const [i, l] of c.titre.split("\n").entries()) {
    if (ctx.measureText(l).width > 2 * Math.min(cx, L - cx)) throw new Error(`couverture : « ${l} » déborde (coupe la ligne ou déplace titre.cx)`);
    ctx.fillText(l, cx, base + i * COUV.titre.pas);
  }
}

/** Ses mesures : « thank you for watching » Medium 42 px à y = 524, « save & follow » à y = 638. */
function fin(ctx: Ctx, c: TexteFin) {
  const [a, b] = c.lignes ?? FIN_DEFAUT;
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.font = `42px "${POLICE.titre}"`;
  ctx.fillText(a, L / 2, 524);
  ctx.fillText(b, L / 2, 638);
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture);
  else if (s.type === "element") await element(ctx, s, c as TexteElement, false);
  else if (s.type === "sophia") await element(ctx, s, c as TexteElement, true);
  else if (s.type === "fin") fin(ctx, c as TexteFin);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
