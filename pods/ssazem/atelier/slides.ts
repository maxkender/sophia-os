// Le rendu des slides du podz 31, au style exact de @ssazem (mesuré le 27/11
// sur ses slides de 1440 × 1440 ; toutes les mesures ci-dessous sont dans ce
// repère, le rendu sort en 1080 × 1080) :
// - un cadre noir, et dedans la photo en carte aux coins arrondis : de
//   (24, 25) à (1415, 1414), rayon 34 ;
// - SES photos d'abord (demande d'Adrien du 27/11 : « reprendre le compte »,
//   sans IA) : images/compte/, son texte effacé par `npm run compte` ; à
//   défaut, la banque de l'OS (images/banque/, alpha_male), passée comme les
//   siennes (noirs levés, contraste adouci) ; du grain fin sur toutes ;
// - UNE phrase, tout en minuscules, en Times (Tinos) de 69,7 px, lignes tous
//   les 67 px, coupée en deux blocs qui se suivent sans blanc : le début calé
//   à GAUCHE (x de son bord gauche), la suite calée à DROITE (x de son bord
//   droit) ; les lignes sont coupées à la main (« \n »), courtes, comme chez
//   lui ; texte blanc sur une photo sombre, noir sur une photo claire ;
// - la slide Sophia : une phrase comme les autres qui cite Sophia, et le LOGO
//   de Sophia (son icône de l'App Store, coins arrondis) sous la suite, calé
//   à droite ; jamais une capture de l'appli.
// Pas de couverture : sa première slide est déjà une phrase.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
/** Le repère de ses mesures, et la taille rendue. */
export const REPERE = 1440;
export const L = 1080;
export const H = 1080;
const K = L / REPERE;

const CARTE = { x: 24, y: 25, l: 1391, h: 1389, r: 34 } as const;
/** Ses mesures : 69,7 px (« sudden positive » : 440 px ; « already come this » : 492 px), lignes tous les 67 px. */
const TEXTE = { taille: 69.7, pas: 67, marge: 80 } as const;
/** Le logo de Sophia sous la suite : 150 px, 34 px sous la dernière ligne de base. */
const LOGO = { c: 150, ecart: 34 } as const;
const ICONE_SOPHIA = "assets/sophia/icone.jpg";
const ENCRES = { blanc: "#FFFFFF", noir: "#141414" } as const;

export type TypeSlide = "citation" | "sophia";
export type Cadrage = { x?: number; y?: number; zoom?: number };
/** Où poser la phrase (repère 1440) : le bord gauche du début, le bord droit de la suite, la première ligne de base. */
export type Place = { x: number; droite: number; base: number };
export type Slide = {
  type: TypeSlide;
  /** Sa photo (images/compte/<nom>.jpg, provenance dans `compte` du post) ou une photo de la banque (images/banque/<nom>.jpg, id dans `banque`). */
  image: string;
  cadrage?: Cadrage;
  encre: keyof typeof ENCRES;
  place: Place;
  [langue: string]: unknown;
};
/** Le début (calé à gauche) et la suite (calée à droite), lignes coupées à la main par « \n ». */
export type TexteCitation = { gauche: string; droite: string };

export type Post = {
  id: string;
  /** Son post qui sert de preuve (le format et les phrases qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Ses photos reprises (texte effacé) : chemin local → son post et le numéro de la slide. */
  compte?: Record<string, { post: string; slide: number }>;
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
export const photosSlide = (s: Slide): string[] => [s.image];

export function textesSlide(_post: Post, s: Slide, langue: string): string {
  const t = contenu<TexteCitation>(s, langue);
  return `${t.gauche} ${t.droite}`.replace(/\s+/g, " ").trim();
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

/** La boîte remplie par l'image (recadrée selon `cadrage`, au centre par défaut ; `zoom` ≥ 1 resserre). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number, cadrage: Cadrage = {}) {
  const zoom = Math.max(1, cadrage.zoom ?? 1);
  const k = Math.max(l / img.width, h / img.height) * zoom;
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

/** Un générateur pseudo-aléatoire à graine : le même grain à chaque rendu d'une slide. */
function hasard(graine: string): () => number {
  let a = 0;
  for (const c of graine) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 0x9e3779b9) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Son traitement de photo, sur la carte (en pixels rendus). Une photo de la
 * banque : noirs levés et contraste adouci (v → 10 + 0,93 v) et un grain
 * monochrome fin (écart-type ≈ 7) ; une des siennes (déjà passée et grainée) :
 * un grain plus léger (≈ 4), qui couvre aussi les zones refaites. Mesuré sur
 * ses aplats : ±4 de grain après compression TikTok.
 */
function passer(ctx: Ctx, x: number, y: number, l: number, h: number, graine: string, sienne: boolean) {
  const d = ctx.getImageData(x, y, l, h);
  const px = d.data;
  const alea = hasard(graine);
  const [a, b, amp] = sienne ? [0, 1, 8] : [10, 0.93, 14];
  for (let i = 0; i < px.length; i += 4) {
    // Une gaussienne approchée (somme de trois uniformes).
    const g = (alea() + alea() + alea() - 1.5) * amp;
    for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, a + px[i + c] * b + g));
  }
  ctx.putImageData(d, x, y);
}

/** La luminance moyenne (0-255) d'une zone du canevas (en pixels rendus). */
function luminance(ctx: Ctx, x: number, y: number, l: number, h: number): number {
  const d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, Math.round(l)), Math.max(1, Math.round(h))).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return s / (d.length / 4);
}

const lignesDe = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const n = post.slides.indexOf(s) + 1;
  const ou = `${post.id} slide ${n}`;
  const t = contenu<TexteCitation>(s, langue);
  if (!t?.gauche || !t?.droite) throw new Error(`${ou} : la phrase en ${langue} (gauche et droite)`);
  if (!ENCRES[s.encre]) throw new Error(`${ou} : encre « blanc » ou « noir »`);

  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, L, H);

  // La carte : la photo, passée et grainée, aux coins arrondis.
  const C = { x: Math.round(CARTE.x * K), y: Math.round(CARTE.y * K), l: Math.round(CARTE.l * K), h: Math.round(CARTE.h * K) };
  const tampon = createCanvas(C.l, C.h);
  const tctx = tampon.getContext("2d");
  remplir(tctx, await image(s.image), 0, 0, C.l, C.h, s.cadrage);
  passer(tctx, 0, 0, C.l, C.h, `${post.id}:${n}`, s.image.startsWith("images/compte/"));
  ctx.save();
  rectArrondi(ctx, C.x, C.y, C.l, C.h, CARTE.r * K);
  ctx.clip();
  ctx.drawImage(tampon, C.x, C.y);
  ctx.restore();

  // La phrase, dans le repère 1440.
  ctx.save();
  ctx.scale(K, K);
  ctx.font = `${TEXTE.taille}px "${POLICE.texte}"`;
  ctx.textBaseline = "alphabetic";
  const gauche = lignesDe(t.gauche);
  const droite = lignesDe(t.droite);
  if (gauche.length > 4 || droite.length > 4) throw new Error(`${ou} : quatre lignes au plus par bloc (chez lui : 1 à 3)`);
  const P = s.place;
  const lg = gauche.map((l) => ctx.measureText(l).width);
  const ld = droite.map((l) => ctx.measureText(l).width);
  const finGauche = P.x + Math.max(...lg);
  const debutDroite = P.droite - Math.max(...ld);
  const derniere = P.base + (gauche.length + droite.length - 1) * TEXTE.pas;
  const haut = P.base - 50;
  const bas = derniere + 18 + (s.type === "sophia" ? LOGO.ecart + LOGO.c - 18 : 0);
  const m = TEXTE.marge;
  if (P.x < CARTE.x + m || P.droite > CARTE.x + CARTE.l - m) throw new Error(`${ou} : la phrase sort de la carte (x ${P.x}, droite ${P.droite} ; entre ${CARTE.x + m} et ${CARTE.x + CARTE.l - m})`);
  if (haut < CARTE.y + m || bas > CARTE.y + CARTE.h - m) throw new Error(`${ou} : la phrase sort de la carte en hauteur (de ${Math.round(haut)} à ${Math.round(bas)})`);
  if (finGauche > P.droite) throw new Error(`${ou} : le début (${Math.round(finGauche)}) dépasse le bord droit de la suite (${P.droite}) : élargis ou coupe`);
  // Chez lui la suite commence nettement à droite du début : sinon on ne voit pas les deux blocs.
  if (debutDroite < P.x + 60) throw new Error(`${ou} : la suite commence à x = ${Math.round(debutDroite)}, trop près du bord gauche du début (${P.x}) : raccourcis ses lignes ou décale « droite »`);

  // Lisible : texte blanc sur une zone sombre, noir sur une zone claire (mesuré sous le texte ;
  // chez lui : du blanc jusqu'à une luminance de ~160, du noir dès ~110).
  const zone = (x0: number, x1: number, y0: number, y1: number) => luminance(ctx, x0 * K, y0 * K, (x1 - x0) * K, (y1 - y0) * K);
  const finA = P.base + (gauche.length - 1) * TEXTE.pas;
  const lumA = zone(P.x, finGauche, haut, finA + 18);
  const lumB = zone(debutDroite, P.droite, finA + TEXTE.pas - 50, derniere + 18);
  for (const [bloc, lum] of [["le début", lumA], ["la suite", lumB]] as const) {
    if (s.encre === "blanc" && lum > 175) throw new Error(`${ou} : ${bloc} en blanc sur une zone claire (luminance ${Math.round(lum)}) : encre noire, ou place la phrase sur une zone sombre`);
    if (s.encre === "noir" && lum < 100) throw new Error(`${ou} : ${bloc} en noir sur une zone sombre (luminance ${Math.round(lum)}) : encre blanche, ou place la phrase sur une zone claire`);
  }

  ctx.fillStyle = ENCRES[s.encre];
  let y = P.base;
  ctx.textAlign = "left";
  for (const l of gauche) {
    ctx.fillText(l, P.x, y);
    y += TEXTE.pas;
  }
  ctx.textAlign = "right";
  for (const l of droite) {
    ctx.fillText(l, P.droite, y);
    y += TEXTE.pas;
  }

  // Le logo de Sophia sous la suite, calé à droite.
  if (s.type === "sophia") {
    const lx = P.droite - LOGO.c;
    const ly = derniere + LOGO.ecart;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    rectArrondi(ctx, lx, ly, LOGO.c, LOGO.c, LOGO.c * 0.2237);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    rectArrondi(ctx, lx, ly, LOGO.c, LOGO.c, LOGO.c * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(ICONE_SOPHIA), lx, ly, LOGO.c, LOGO.c);
    ctx.restore();
  } else if (s.type !== "citation") throw new Error(`${ou} : type de slide inconnu : ${s.type}`);
  ctx.restore();

  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
