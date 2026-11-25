// Le rendu des slides du podz 29, au style exact de @mariadianatudor (mesuré le
// 25/11 sur ses slides de 1080 × 1440, « Paintings That Devour My Soul ») :
// - la couverture : une photo sombre plein cadre (une foule de dos au musée
//   devant un tableau éclairé), le titre blanc en TikTok Sans Medium 44 px à
//   x = 270, deux lignes au plus ;
// - une œuvre : fond blanc cassé (#FBFBFB), le titre de l'œuvre centré en haut
//   (Medium 56 px), le tableau à gauche (515 px de large au plus, centré sur
//   y = 720), le paragraphe à droite (Regular 27 px, une ligne tous les
//   33,5 px, centré sur le tableau), qui CONTINUE le titre (« [The Kiss] is a
//   profound exploration of… »), et l'artiste sous le tableau, calé à droite
//   (Medium 37,5 px) ;
// - la slide Artura : une œuvre dont le paragraphe cite Artura à la première
//   personne, le LOGO d'Artura (son icône, coins arrondis) posé sous le
//   paragraphe ; jamais une capture de l'appli.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1440;

const FOND = "#FBFBFB";
const ENCRE = "#0A0A0A";
const LOGO_ARTURA = "assets/artura/icone.png";

export type TypeSlide = "couverture" | "oeuvre" | "artura";
export type Cadrage = { x?: number; y?: number };
export type Slide = {
  type: TypeSlide;
  /** La couverture : sa photo plein cadre ; une œuvre : le tableau (images/oeuvres/…). */
  image: string;
  cadrage?: Cadrage;
  [langue: string]: unknown;
};

export type TexteCouverture = { titre: string };
export type TexteOeuvre = { titre: string; texte: string; artiste: string };

/** Une œuvre du domaine public : d'où vient l'image (Met Open Access, CC0). */
export type Source = { musee: string; id: string; titre: string; artiste: string; date: string; url: string };

export type Post = {
  id: string;
  /** Le post du compte modèle qui sert de preuve (format et accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Les œuvres : chemin local → leur fiche au musée (domaine public vérifié). */
  oeuvres?: Record<string, Source>;
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
/** La slide de l'appli, que l'OS marque `position_app: "artura"`. */
export const estSlideApp = (s: Slide) => s.type === "artura";
export const photosSlide = (s: Slide): string[] => [s.image];

export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return (c as TexteCouverture).titre.replace(/\n/g, " ");
  const t = c as TexteOeuvre;
  return `${t.titre} ${t.texte} — ${t.artiste}`;
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

// --- La couverture ------------------------------------------------------------------

/** Ses mesures : « Paintings That Devour My / Soul » Medium 44 px à x = 270, lignes de base
 * à 518 puis 574, coupé sur 540 px. */
const COUV = { x: 270, base: 518, pas: 56, taille: 44, largeur: 540, maxLignes: 2 } as const;

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  remplir(ctx, await image(s.image), 0, 0, L, H, s.cadrage);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `${COUV.taille}px "${POLICE.titre}"`;
  const lignes = c.titre.split("\n").flatMap((l) => couper(ctx, l, COUV.largeur));
  if (lignes.length > COUV.maxLignes) throw new Error(`couverture : « ${c.titre} » tient en ${COUV.maxLignes} lignes au plus`);
  for (const [i, l] of lignes.entries()) ctx.fillText(l, COUV.x, COUV.base + i * COUV.pas);
}

// --- Une œuvre ------------------------------------------------------------------------

/** Ses mesures (« The Kiss ») : le titre Medium 56 px centré, ligne de base 256 (deux lignes :
 * 212 et 274) ; le tableau à x = 37, 515 px de large au plus, 830 px de haut au plus, centré
 * sur y = 720 ; le paragraphe Regular 27 px, 27 px à droite du tableau, 372 px de large, une
 * ligne tous les 33,5 px, centré sur le tableau ; l'artiste Medium 37,5 px calé à droite sous
 * le tableau, ligne de base 47 px sous son bas. Le logo d'Artura : 112 px, 34 px sous le texte. */
const OEUVRE = {
  titre: { taille: 56, base: 256, pas: 62, largeur: 960 },
  tableau: { x: 37, l: 515, h: 830, centre: 720 },
  texte: { ecart: 27, largeur: 372, taille: 27, pas: 33.5, maxLignes: 15 },
  artiste: { taille: 37.5, ecart: 47 },
  logo: { c: 112, ecart: 34 },
} as const;

async function oeuvre(ctx: Ctx, s: Slide, c: TexteOeuvre, artura: boolean) {
  const img = await image(s.image);
  const k = Math.min(OEUVRE.tableau.l / img.width, OEUVRE.tableau.h / img.height);
  const lt = Math.round(img.width * k);
  const ht = Math.round(img.height * k);
  const x = OEUVRE.tableau.x;
  const y = Math.round(OEUVRE.tableau.centre - ht / 2);
  ctx.drawImage(img, x, y, lt, ht);

  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.font = `${OEUVRE.titre.taille}px "${POLICE.titre}"`;
  const titre = couper(ctx, c.titre, OEUVRE.titre.largeur);
  if (titre.length > 2) throw new Error(`« ${c.titre} » : deux lignes de titre au plus`);
  const base0 = titre.length === 2 ? OEUVRE.titre.base - (OEUVRE.titre.pas - 18) : OEUVRE.titre.base;
  for (const [i, l] of titre.entries()) ctx.fillText(l, L / 2, base0 + i * OEUVRE.titre.pas);

  ctx.textAlign = "right";
  ctx.font = `${OEUVRE.artiste.taille}px "${POLICE.titre}"`;
  ctx.fillText(c.artiste, x + lt, y + ht + OEUVRE.artiste.ecart);

  ctx.textAlign = "left";
  ctx.font = `${OEUVRE.texte.taille}px "${POLICE.texte}"`;
  const tx = x + lt + OEUVRE.texte.ecart;
  const largeur = Math.min(OEUVRE.texte.largeur, L - tx - 40);
  const lignes = couper(ctx, c.texte, largeur);
  if (lignes.length > OEUVRE.texte.maxLignes) throw new Error(`« ${c.titre} » : texte trop long (${lignes.length} lignes, ${OEUVRE.texte.maxLignes} au plus)`);
  const logo = artura ? OEUVRE.logo.c + OEUVRE.logo.ecart : 0;
  const hauteur = lignes.length * OEUVRE.texte.pas + logo;
  // Centré sur le tableau : la première ligne de base un peu sous le haut du bloc (ascendantes).
  let yt = OEUVRE.tableau.centre - hauteur / 2 + OEUVRE.texte.taille * 0.78;
  for (const l of lignes) {
    ctx.fillText(l, tx, yt);
    yt += OEUVRE.texte.pas;
  }
  if (artura) {
    const g = OEUVRE.logo;
    const ly = yt - OEUVRE.texte.pas + g.ecart;
    ctx.save();
    rectArrondi(ctx, tx, ly, g.c, g.c, g.c * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(LOGO_ARTURA), tx, ly, g.c, g.c);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture);
  else if (s.type === "oeuvre") await oeuvre(ctx, s, c as TexteOeuvre, false);
  else if (s.type === "artura") await oeuvre(ctx, s, c as TexteOeuvre, true);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
