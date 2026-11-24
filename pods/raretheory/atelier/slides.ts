// Le rendu des slides du podz 27, au style exact de @raretheory_ (mesuré le
// 24/11 sur ses slides de 1144 × 1432, ramenées ici à 1080 × 1350, 4:5) :
// - le fond bordeaux uni (#700030), le texte crème (#FFFADE), de l'Arial
//   Narrow partout (Arimo resserré à 89 %), tout en minuscules (« u », « ur ») ;
// - la couverture : le titre justifié à gauche (« topic to research / when
//   u're bored »), un sous-titre plus petit, justifié aussi, et deux petites
//   photos à droite (une en paysage en haut, une carrée en bas) ;
// - une catégorie : « 03 — History & Civilizations » puis ses sujets, un par
//   ligne, en retrait (jusqu'à 15) ;
// - un point (ses listes « skills i'm glad i started learning at 14 ») :
//   « 01 — public speaking », une petite photo à droite du titre (facultative)
//   et un ou deux paragraphes justifiés ;
// - la slide Sophia : un point dont la petite photo est le LOGO de Sophia
//   (son icône de l'App Store, coins arrondis) ; jamais une capture de l'appli ;
// - la fin : un paragraphe justifié au centre, sa dernière phrase en gras
//   (chez elle : « Hi, i build RARETHEORY… OR.. we'll not gonna meet again. »).
// Les catégories, les points et la slide Sophia sont numérotés au rendu
// (« 01 — », « 02 — »…), dans l'ordre du post.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1350;

const FOND = "#700030";
const ENCRE = "#FFFADE";
/** Arial Narrow ≈ Arial à 89 % de sa largeur (mesuré sur ses titres, ses sujets et sa couverture). */
const ETROIT = 0.89;
const ICONE_SOPHIA = "assets/sophia/icone.jpg";

export type TypeSlide = "couverture" | "categorie" | "point" | "sophia" | "fin";
export type Cadrage = { x?: number; y?: number };
export type Photo = { image: string; cadrage?: Cadrage };
export type Slide = {
  type: TypeSlide;
  /** La couverture : [haut (paysage), bas (carrée)] ; un point : [la petite photo], facultative. */
  photos?: Photo[];
  [langue: string]: unknown;
};

export type TexteCouverture = { titre: string; sous_titre?: string };
export type TexteCategorie = { titre: string; sujets: string[] };
export type TextePoint = { titre: string; paragraphes: string[] };
export type TexteFin = { texte: string; gras?: string };

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
const numerotee = (s: Slide) => s.type === "categorie" || s.type === "point" || s.type === "sophia";
/** « 01 », « 02 »… : le rang de la slide parmi les catégories, les points et la slide Sophia. */
export function numero(post: Post, s: Slide): string {
  const n = post.slides.filter(numerotee).indexOf(s) + 1;
  return String(n).padStart(2, "0");
}

export function textesSlide(post: Post, s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") {
    const t = c as TexteCouverture;
    return [t.titre.replace(/\n/g, " "), t.sous_titre].filter(Boolean).join(" — ");
  }
  if (s.type === "fin") {
    const t = c as TexteFin;
    return [t.texte, t.gras].filter(Boolean).join(" ");
  }
  if (s.type === "categorie") {
    const t = c as TexteCategorie;
    return `${numero(post, s)} — ${t.titre} : ${t.sujets.join(", ")}`;
  }
  const t = c as TextePoint;
  return [`${numero(post, s)} — ${t.titre}`, ...t.paragraphes].join(" — ");
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

// --- Le texte resserré, justifié -----------------------------------------------------

type Mot = { t: string; gras: boolean };
const police = (taille: number, gras: boolean) => `${taille}px "${gras ? POLICE.gras : POLICE.texte}"`;

function largeur(ctx: Ctx, t: string, taille: number, gras = false): number {
  ctx.font = police(taille, gras);
  return ctx.measureText(t).width * ETROIT;
}

function ecrire(ctx: Ctx, t: string, x: number, y: number, taille: number, gras = false) {
  ctx.font = police(taille, gras);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(ETROIT, 1);
  ctx.fillText(t, 0, 0);
  ctx.restore();
}

/** Coupe des mots en lignes de `boite` px au plus (largeurs resserrées). */
function couper(ctx: Ctx, mots: Mot[], taille: number, boite: number): Mot[][] {
  const lignes: Mot[][] = [];
  let cur: Mot[] = [];
  const espace = largeur(ctx, " ", taille);
  const l = (ms: Mot[]) => ms.reduce((s, m) => s + largeur(ctx, m.t, taille, m.gras), 0) + espace * Math.max(0, ms.length - 1);
  for (const m of mots) {
    if (cur.length && l([...cur, m]) > boite) {
      lignes.push(cur);
      cur = [m];
    } else cur.push(m);
  }
  if (cur.length) lignes.push(cur);
  return lignes;
}

/** Une ligne justifiée sur `boite` px (la dernière d'un paragraphe reste à gauche). */
function ligneJustifiee(ctx: Ctx, mots: Mot[], x: number, y: number, taille: number, boite: number, justifier: boolean) {
  const ls = mots.map((m) => largeur(ctx, m.t, taille, m.gras));
  const total = ls.reduce((s, v) => s + v, 0);
  const espace = justifier && mots.length > 1 ? (boite - total) / (mots.length - 1) : largeur(ctx, " ", taille);
  let cx = x;
  for (const [i, m] of mots.entries()) {
    ecrire(ctx, m.t, cx, y, taille, m.gras);
    cx += ls[i] + espace;
  }
}

/** Un paragraphe justifié ; rend la ligne de base suivante. */
function paragraphe(ctx: Ctx, mots: Mot[], x: number, y: number, taille: number, boite: number, pas: number): number {
  const lignes = couper(ctx, mots, taille, boite);
  for (const [i, l] of lignes.entries()) {
    ligneJustifiee(ctx, l, x, y, taille, boite, i < lignes.length - 1);
    y += pas;
  }
  return y;
}
const motsDe = (t: string, gras = false): Mot[] => t.split(/\s+/).filter(Boolean).map((m) => ({ t: m, gras }));

// --- La couverture ------------------------------------------------------------------

/** Ses mesures (pt.2, 652 k) : la photo du haut à (576, 144) en 364 × 254, celle du bas
 * à (649, 918) en 291 × 291 ; le titre à x = 74, 74,6 px, lignes de base à 632 puis
 * tous les 106 px, chaque ligne sauf la dernière justifiée sur ~610 px ; le sous-titre
 * 43,8 px, 66 px sous le titre, lignes tous les 62 px, justifié sur 497 px. */
const COUV = {
  haut: { x: 576, y: 144, l: 364, h: 254 },
  bas: { x: 649, y: 918, l: 291, h: 291 },
  titre: { x: 74, base: 632, pas: 106, taille: 74.6, boite: 610 },
  sous_titre: { ecart: 66, pas: 62, taille: 43.8, boite: 497 },
  fin: 900,
} as const;

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  const photos = s.photos ?? [];
  if (photos.length !== 2) throw new Error("couverture : deux photos (haut en paysage, bas carrée)");
  remplir(ctx, await image(photos[0].image), COUV.haut.x, COUV.haut.y, COUV.haut.l, COUV.haut.h, photos[0].cadrage);
  remplir(ctx, await image(photos[1].image), COUV.bas.x, COUV.bas.y, COUV.bas.l, COUV.bas.h, photos[1].cadrage);
  ctx.fillStyle = ENCRE;
  const T = COUV.titre;
  const lignes = c.titre.split("\n");
  if (lignes.length > 3) throw new Error("couverture : trois lignes de titre au plus");
  let y: number = T.base;
  for (const [i, l] of lignes.entries()) {
    const mots = motsDe(l);
    const naturelle = largeur(ctx, l, T.taille);
    if (naturelle > T.boite) throw new Error(`couverture : « ${l} » déborde (${Math.round(naturelle)} px pour ${T.boite}) : coupe la ligne`);
    const derniere = i === lignes.length - 1;
    // Chez elle, une ligne justifiée garde de grands blancs, jamais des trous : pas moins de 60 % de la boîte.
    if (!derniere && naturelle < T.boite * 0.6) throw new Error(`couverture : « ${l} » trop courte pour être justifiée : regroupe les lignes`);
    ligneJustifiee(ctx, mots, T.x, y, T.taille, T.boite, !derniere && mots.length > 1);
    y += T.pas;
  }
  y -= T.pas;
  if (c.sous_titre) {
    const S = COUV.sous_titre;
    y = paragraphe(ctx, motsDe(c.sous_titre), T.x, y + S.ecart, S.taille, S.boite, S.pas) - S.pas;
  }
  if (y > COUV.fin) throw new Error(`couverture : le texte descend jusqu'à y = ${Math.round(y)} (photo du bas à ${COUV.bas.y}) : raccourcis`);
}

// --- Une catégorie ------------------------------------------------------------------

/** Ses mesures : « 03 — History & Civilizations » 46,7 px à (55, 307) ; les sujets
 * 35,9 px à x = 109, première ligne de base à 376, puis tous les 52,9 px (14 à 16 chez elle). */
const CAT = {
  titre: { x: 55, base: 307, taille: 46.7 },
  sujets: { x: 109, base: 376, pas: 52.9, taille: 35.9, max: 15, droite: 1020 },
} as const;

function categorie(ctx: Ctx, n: string, c: TexteCategorie) {
  ctx.fillStyle = ENCRE;
  const titre = `${n} — ${c.titre}`;
  if (CAT.titre.x + largeur(ctx, titre, CAT.titre.taille) > CAT.sujets.droite) throw new Error(`« ${titre} » : titre trop long`);
  ecrire(ctx, titre, CAT.titre.x, CAT.titre.base, CAT.titre.taille);
  if (c.sujets.length < 6 || c.sujets.length > CAT.sujets.max) throw new Error(`« ${c.titre} » : 6 à ${CAT.sujets.max} sujets (trouvé ${c.sujets.length})`);
  for (const [i, sujet] of c.sujets.entries()) {
    if (CAT.sujets.x + largeur(ctx, sujet, CAT.sujets.taille) > CAT.sujets.droite) throw new Error(`« ${sujet} » : sujet trop long`);
    ecrire(ctx, sujet, CAT.sujets.x, CAT.sujets.base + i * CAT.sujets.pas, CAT.sujets.taille);
  }
}

// --- Un point et la slide Sophia -------------------------------------------------------

/** Ses mesures (« 01 — public speaking ») : le titre 46,7 px à (68, 418) ; la petite
 * photo à (650, 151) en 305 × 318 ; les paragraphes 34,9 px à x = 109, justifiés sur
 * 658 px, première ligne de base à 556, puis tous les 48,1 px, une ligne vide entre deux. */
const POINT = {
  titre: { x: 68, base: 418, taille: 46.7, droite: 630, droiteSansPhoto: 1010 },
  photo: { x: 650, y: 151, l: 305, h: 318 },
  logo: { x: 650, y: 157, c: 305 },
  texte: { x: 109, base: 556, taille: 34.9, pas: 48.1, boite: 658, fin: 1250 },
} as const;

async function point(ctx: Ctx, n: string, s: Slide, c: TextePoint, sophia: boolean) {
  const photos = s.photos ?? [];
  if (sophia && photos.length) throw new Error("slide Sophia : pas de photo (son logo est posé au rendu)");
  if (photos.length > 1) throw new Error(`« ${c.titre} » : une petite photo au plus`);
  if (sophia) {
    const g = POINT.logo;
    ctx.save();
    rectArrondi(ctx, g.x, g.y, g.c, g.c, g.c * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(ICONE_SOPHIA), g.x, g.y, g.c, g.c);
    ctx.restore();
  } else if (photos[0]) {
    const p = POINT.photo;
    remplir(ctx, await image(photos[0].image), p.x, p.y, p.l, p.h, photos[0].cadrage);
  }
  ctx.fillStyle = ENCRE;
  const titre = `${n} — ${c.titre}`;
  const droite = sophia || photos.length ? POINT.titre.droite : POINT.titre.droiteSansPhoto;
  if (POINT.titre.x + largeur(ctx, titre, POINT.titre.taille) > droite) throw new Error(`« ${titre} » : titre trop long (il touche la photo)`);
  ecrire(ctx, titre, POINT.titre.x, POINT.titre.base, POINT.titre.taille);
  const T = POINT.texte;
  let y: number = T.base;
  for (const p of c.paragraphes) y = paragraphe(ctx, motsDe(p), T.x, y, T.taille, T.boite, T.pas) + T.pas;
  const derniere = y - 2 * T.pas;
  if (derniere > T.fin) throw new Error(`« ${c.titre} » : texte trop long (dernière ligne à y = ${Math.round(derniere)}) : raccourcis`);
}

// --- La fin ----------------------------------------------------------------------------

/** Ses mesures : 48,8 px, justifié sur 609 px à x = 213, première ligne de base à 455,
 * lignes tous les 71,7 px, la dernière phrase en gras. */
const FIN = { x: 213, base: 455, taille: 48.8, pas: 71.7, boite: 609, fin: 1150 } as const;

function fin(ctx: Ctx, c: TexteFin) {
  ctx.fillStyle = ENCRE;
  const y = paragraphe(ctx, [...motsDe(c.texte), ...motsDe(c.gras ?? "", true)], FIN.x, FIN.base, FIN.taille, FIN.boite, FIN.pas) - FIN.pas;
  if (y > FIN.fin) throw new Error(`fin : texte trop long (dernière ligne à y = ${Math.round(y)})`);
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
  else if (s.type === "categorie") categorie(ctx, numero(post, s), c as TexteCategorie);
  else if (s.type === "point") await point(ctx, numero(post, s), s, c as TextePoint, false);
  else if (s.type === "sophia") await point(ctx, numero(post, s), s, c as TextePoint, true);
  else if (s.type === "fin") fin(ctx, c as TexteFin);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
