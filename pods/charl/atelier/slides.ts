// Le rendu des slides du podz 28, au style exact de @charl.focus (mesuré le
// 24/11 sur ses slides de 1080 × 1080) :
// - le fond noir, tout en Montserrat : les titres en Regular blanc, le texte en
//   Light gris clair (#D6D6D6), ses mots forts en SemiBold blanc (**gras**
//   dans le post), justifié, tout en minuscules ;
// - la couverture : six images en deux rangées de trois (IRM en couleurs,
//   cerveaux, silhouettes), au centre « cómo arreglar tu » (Regular 66 px) et
//   le mot clé en capitales (« DOPAMINA », Bold 100 px), puis une note entre
//   parenthèses (« (de verdad) », Light 38 px) ;
// - un point : « 1 · nada te motiva. » puis des paragraphes, avec soit deux
//   photos en colonne à droite (le titre à gauche), soit deux photos en bas
//   (le titre centré, plus grand, le texte sur toute la largeur) ;
// - la slide Sophia : un point en colonne dont la photo du haut est le LOGO de
//   Sophia (son icône de l'App Store, coins arrondis), à la place de sa slide
//   d'appli ; jamais une capture de l'appli ;
// - la fin : « tu cerebro no está roto. », un texte plus grand et une photo
//   haute à droite, sans numéro.
// Les points et la slide Sophia sont numérotés au rendu (« 1 · », « 2 · »…).

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1080;

const FOND = "#000000";
const BLANC = "#FFFFFF";
const GRIS = "#D6D6D6";
const ICONE_SOPHIA = "assets/sophia/icone.jpg";

export type TypeSlide = "couverture" | "point" | "sophia" | "fin";
export type Cadrage = { x?: number; y?: number };
export type Photo = { image: string; cadrage?: Cadrage };
export type Slide = {
  type: TypeSlide;
  /** Un point : `droite` (photos en colonne à droite, par défaut) ou `bas` (deux photos en bas). */
  mise?: "droite" | "bas";
  /** La couverture : six images (haut gauche → droite, puis bas) ; un point : une ou deux ; la slide Sophia : zéro ou une (sous le logo) ; la fin : une. */
  photos?: Photo[];
  [langue: string]: unknown;
};

export type TexteCouverture = { haut: string; mot: string; note?: string };
export type TextePoint = { titre: string; paragraphes: string[] };

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
const numerotee = (s: Slide) => s.type === "point" || s.type === "sophia";
/** « 1 », « 2 »… : le rang de la slide parmi les points et la slide Sophia. */
export function numero(post: Post, s: Slide): number {
  return post.slides.filter(numerotee).indexOf(s) + 1;
}
const sansGras = (t: string) => t.replace(/\*\*/g, "");

export function textesSlide(post: Post, s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") {
    const t = c as TexteCouverture;
    return [`${t.haut} ${t.mot}`, t.note].filter(Boolean).join(" ");
  }
  const t = c as TextePoint;
  const titre = s.type === "fin" ? t.titre : `${numero(post, s)} · ${t.titre}`;
  return sansGras([titre, ...t.paragraphes].join(" — "));
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

// --- Le texte : des mots faits de morceaux légers ou gras, justifiés -----------------

type Morceau = { t: string; gras: boolean };
type Mot = Morceau[];

/** « lo que sí funciona es **bajar el listón**: reducir… » → des mots ; un mot peut mêler léger et gras (« listón: »). */
function motsDe(texte: string): Mot[] {
  const mots: Mot[] = [];
  let gras = false;
  let cur: Mot = [];
  const pousser = () => {
    if (cur.some((m) => m.t)) mots.push(cur.filter((m) => m.t));
    cur = [];
  };
  for (const [i, bout] of texte.split("**").entries()) {
    if (i > 0) gras = !gras;
    const parts = bout.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) pousser();
      else cur.push({ t: p, gras });
    }
  }
  pousser();
  if (gras) throw new Error(`« ${texte.slice(0, 40)}… » : un ** n'est pas refermé`);
  return mots;
}

const policeTexte = (taille: number, gras: boolean) => `${taille}px "${gras ? POLICE.gras : POLICE.leger}"`;
function largeurMot(ctx: Ctx, m: Mot, taille: number): number {
  return m.reduce((s, x) => {
    ctx.font = policeTexte(taille, x.gras);
    return s + ctx.measureText(x.t).width;
  }, 0);
}

/** Un paragraphe justifié sur `boite` px (la dernière ligne à gauche) ; rend la ligne de base suivante. */
function paragraphe(ctx: Ctx, texte: string, x: number, y: number, taille: number, boite: number, pas: number): number {
  const mots = motsDe(texte);
  ctx.font = policeTexte(taille, false);
  const espace = ctx.measureText(" ").width;
  const lignes: Mot[][] = [];
  let cur: Mot[] = [];
  const l = (ms: Mot[]) => ms.reduce((s, m) => s + largeurMot(ctx, m, taille), 0) + espace * Math.max(0, ms.length - 1);
  for (const m of mots) {
    if (cur.length && l([...cur, m]) > boite) {
      lignes.push(cur);
      cur = [m];
    } else cur.push(m);
  }
  if (cur.length) lignes.push(cur);
  for (const [i, ligne] of lignes.entries()) {
    const ls = ligne.map((m) => largeurMot(ctx, m, taille));
    const total = ls.reduce((s, v) => s + v, 0);
    const justifier = i < lignes.length - 1 && ligne.length > 1;
    const e = justifier ? (boite - total) / (ligne.length - 1) : espace;
    let cx = x;
    for (const [k, m] of ligne.entries()) {
      let mx = cx;
      for (const morceau of m) {
        ctx.font = policeTexte(taille, morceau.gras);
        ctx.fillStyle = morceau.gras ? BLANC : GRIS;
        ctx.fillText(morceau.t, mx, y);
        mx += ctx.measureText(morceau.t).width;
      }
      cx += ls[k] + e;
    }
    y += pas;
  }
  return y;
}

function titre(ctx: Ctx, t: string, x: number, y: number, taille: number, centre: boolean, max: number) {
  ctx.font = `${taille}px "${POLICE.titre}"`;
  const l = ctx.measureText(t).width;
  if (l > max) throw new Error(`« ${t} » : titre trop long (${Math.round(l)} px pour ${max})`);
  ctx.fillStyle = BLANC;
  ctx.fillText(t, centre ? x - l / 2 : x, y);
}

// --- La couverture ------------------------------------------------------------------

/** Ses mesures : les six images en deux rangées de trois (360 × 330), en haut (y = 0) et en
 * bas (y = 750) ; « cómo dejar de » Regular 66 px centré, ligne de base 464 ; le mot clé
 * Bold 100 px, ligne de base 568 ; la note Light 38 px, ligne de base 645. */
const COUV = {
  cases: [0, 360, 720].flatMap((x) => [{ x, y: 0 }]).concat([0, 360, 720].map((x) => ({ x, y: 750 }))),
  case: { l: 360, h: 330 },
  haut: { base: 464, taille: 66 },
  mot: { base: 568, taille: 100 },
  note: { base: 645, taille: 38 },
  max: 1000,
} as const;

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  const photos = s.photos ?? [];
  if (photos.length !== 6) throw new Error("couverture : six images (trois en haut, trois en bas)");
  for (const [i, p] of photos.entries()) {
    const b = COUV.cases[i];
    remplir(ctx, await image(p.image), b.x, b.y, COUV.case.l, COUV.case.h, p.cadrage);
  }
  ctx.font = `${COUV.haut.taille}px "${POLICE.titre}"`;
  titre(ctx, c.haut, L / 2, COUV.haut.base, COUV.haut.taille, true, COUV.max);
  if (c.mot !== c.mot.toUpperCase()) throw new Error(`couverture : le mot clé en capitales (« ${c.mot.toUpperCase()} »)`);
  ctx.font = `${COUV.mot.taille}px "${POLICE.fort}"`;
  const l = ctx.measureText(c.mot).width;
  if (l > COUV.max) throw new Error(`couverture : « ${c.mot} » trop long (${Math.round(l)} px)`);
  ctx.fillStyle = BLANC;
  ctx.fillText(c.mot, (L - l) / 2, COUV.mot.base);
  if (c.note) {
    ctx.font = `${COUV.note.taille}px "${POLICE.leger}"`;
    const n = ctx.measureText(c.note).width;
    ctx.fillStyle = GRIS;
    ctx.fillText(c.note, (L - n) / 2, COUV.note.base);
  }
}

// --- Un point, la slide Sophia, la fin -------------------------------------------------

/** Ses mesures (« 3 · el mito del detox ») : le titre Regular 63 px à (80, 121) ; le texte Light
 * 31,5 px à x = 81, justifié sur 597 px, première ligne de base à 202, puis tous les 44 px,
 * 27 px de plus entre deux paragraphes ; la colonne de photos à x = 720 (310 px) : deux
 * photos, 306 px de haut à y = 270, puis 331 px à y = 615 ; une seule : 523 px à y = 333.
 * En bas (« 1 · nada te motiva. ») : le titre 75 px centré, ligne de base 132 ; le texte
 * sur 917 px, première ligne de base à 217 ; deux photos de 388 × 320 à y = 720.
 * La fin (« tu cerebro no está roto. ») : le texte 37 px, tous les 54 px. */
const DROITE = {
  titre: { x: 80, base: 121, taille: 63, max: 930 },
  texte: { x: 81, base: 202, taille: 31.5, boite: 597, pas: 44, entre: 27, fin: 1010 },
  colonne: { x: 720, l: 310, deux: [{ y: 270, h: 306 }, { y: 615, h: 331 }], une: { y: 333, h: 523 } },
} as const;
const BAS = {
  titre: { x: 540, base: 132, taille: 75, max: 940 },
  texte: { x: 81, base: 217, taille: 31.5, boite: 917, pas: 44, entre: 27, fin: 690 },
  photos: [{ x: 80, y: 720, l: 388, h: 320 }, { x: 612, y: 720, l: 388, h: 320 }],
} as const;
const FIN = { texte: { x: 81, base: 203, taille: 37, boite: 597, pas: 54, entre: 34, fin: 1010 } } as const;

async function point(ctx: Ctx, post: Post, s: Slide, c: TextePoint) {
  const photos = s.photos ?? [];
  const sophia = s.type === "sophia";
  const fin = s.type === "fin";
  const mise = sophia || fin ? "droite" : (s.mise ?? "droite");
  const t = fin ? c.titre : `${numero(post, s)} · ${c.titre}`;
  if (mise === "bas") {
    if (photos.length !== 2) throw new Error(`« ${t} » : deux photos en bas`);
    for (const [i, p] of photos.entries()) {
      const b = BAS.photos[i];
      remplir(ctx, await image(p.image), b.x, b.y, b.l, b.h, p.cadrage);
    }
    titre(ctx, t, BAS.titre.x, BAS.titre.base, BAS.titre.taille, true, BAS.titre.max);
    textes(ctx, c, BAS.texte, t);
    return;
  }
  const C = DROITE.colonne;
  if (sophia) {
    if (photos.length > 1) throw new Error("slide Sophia : une photo au plus, sous le logo");
    const [a] = C.deux;
    ctx.save();
    rectArrondi(ctx, C.x, a.y, C.l, C.l, C.l * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(ICONE_SOPHIA), C.x, a.y, C.l, C.l);
    ctx.restore();
    if (photos[0]) remplir(ctx, await image(photos[0].image), C.x, C.deux[1].y, C.l, C.deux[1].h, photos[0].cadrage);
  } else if (photos.length === 1) {
    remplir(ctx, await image(photos[0].image), C.x, C.une.y, C.l, C.une.h, photos[0].cadrage);
  } else if (photos.length === 2) {
    for (const [i, p] of photos.entries()) remplir(ctx, await image(p.image), C.x, C.deux[i].y, C.l, C.deux[i].h, p.cadrage);
  } else throw new Error(`« ${t} » : une ou deux photos à droite`);
  titre(ctx, t, DROITE.titre.x, DROITE.titre.base, DROITE.titre.taille, false, DROITE.titre.max);
  textes(ctx, c, fin ? FIN.texte : DROITE.texte, t);
}

function textes(ctx: Ctx, c: TextePoint, T: { x: number; base: number; taille: number; boite: number; pas: number; entre: number; fin: number }, t: string) {
  let y = T.base;
  for (const p of c.paragraphes) y = paragraphe(ctx, p, T.x, y, T.taille, T.boite, T.pas) + T.entre;
  const derniere = y - T.entre - T.pas;
  if (derniere > T.fin) throw new Error(`« ${t} » : texte trop long (dernière ligne à y = ${Math.round(derniere)}, ${T.fin} au plus) : raccourcis`);
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture);
  else if (s.type === "point" || s.type === "sophia" || s.type === "fin") await point(ctx, post, s, c as TextePoint);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
