// Un original (posts/<id>.json) et le rendu de ses slides, au style exact de
// @built.not.born61 (relevé du 19/11 : « GLOW UP HACKS FOR MEN. » 428 k,
// « 6 WAYS TO BECOME A BETTER LOOKING MAN »), en 1080 × 1280, fond blanc :
// - la couverture : le titre en capitales grasses, centré en haut, et un homme
//   détouré en noir et blanc qui monte du bas de la slide ;
// - une slide par conseil : « 2. Have a bright smile » en gras, le texte centré
//   dessous, puis une image détourée (un buste coupé par le bas, ou un objet
//   posé au milieu de l'espace libre) ;
// - la slide Atala (demande d'Adrien du 19/11) : un conseil comme les autres
//   (« courir »), avec un HOMME QUI COURT détouré (photo de la banque de l'OS,
//   label male_run) et le LOGO d'Atala à côté, comme ses petites icônes autour
//   d'un personnage (« 5. HAVE A LIFE ») ;
// - la fin : « Follow for more » et un homme détouré.
// Toutes les mesures sont prises sur ses slides (1080 de large).

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1280;

const FOND = "#fefefe";
const ENCRE = "#000000";
/** Son texte courant : un noir un peu adouci. */
const TEXTE = "#1a1a1a";
const ICONE_ATALA = "assets/atala/icone.png";

export type TypeSlide = "couverture" | "conseil" | "fin";
/**
 * Une slide. Les images sont au niveau de la slide (les mêmes dans toutes les
 * langues), les textes sous la clé de chaque langue :
 * - couverture : `image` (un homme détouré, noir et blanc) ; texte `{ "titre": "GLOW UP HABITS\nTHAT ACTUALLY WORK." }` ;
 * - conseil : `image`, `mode` (`bas` : un buste à la largeur `taille` (600 par
 *   défaut), posé en bas et coupé par le bas s'il dépasse ; `objet` : posé au
 *   milieu de l'espace libre, `taille` px au plus de côté) ; texte
 *   `{ "titre": "2. Have a bright smile", "texte": "…" }` ; `"atala": true` sur
 *   LA slide Atala (un homme qui court, `mode` `objet`) : son logo est ajouté à côté ;
 * - fin : `image` ; texte `{ "texte": "Follow for more" }`.
 */
export type Slide = {
  type: TypeSlide;
  image: string;
  mode?: "bas" | "objet";
  taille?: number;
  atala?: boolean;
  [langue: string]: unknown;
};
export type TexteCouverture = { titre: string };
export type TexteConseil = { titre: string; texte: string };
export type TexteFin = { texte: string };

export type Post = {
  id: string;
  /** Le post du compte modèle qui sert de preuve (format et accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Les photos de la banque de l'OS utilisées (détourées) : chemin local → id dans la médiathèque. */
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
/** La slide de l'appli, que l'OS marque `position_app`. */
export const estSlideAtala = (s: Slide) => s.atala === true;
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, string>>(s, langue);
  if (!c) return "";
  return [c.titre, c.texte].filter(Boolean).join(" — ").replace(/\n/g, " ");
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

/** Ses titres : League Spartan Bold resserrée de 2,5 % (largeurs mesurées sur ses slides). */
function policeTitre(ctx: Ctx, taille: number) {
  ctx.font = `${taille}px "${POLICE.titre}", "${POLICE.titreGrec}"`;
  ctx.letterSpacing = `${(-0.0246 * taille).toFixed(2)}px`;
}
function policeTexte(ctx: Ctx, taille: number, police: string = POLICE.texte) {
  ctx.font = `${taille}px "${police}"`;
  ctx.letterSpacing = "0px";
}

function couper(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const para of t.split("\n")) {
    let ligne = "";
    for (const mot of para.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (ligne && ctx.measureText(essai).width > largeur) {
        lignes.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    if (ligne) lignes.push(ligne);
  }
  return lignes;
}

/** Deux lignes de longueurs proches plutôt qu'un mot seul en bas (ses titres de conseil). */
function equilibrer(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes = couper(ctx, t, largeur);
  if (lignes.length !== 2) return lignes;
  const mots = t.split(/\s+/);
  let meilleur = lignes;
  let ecart = Infinity;
  for (let i = 1; i < mots.length; i++) {
    const a = mots.slice(0, i).join(" ");
    const b = mots.slice(i).join(" ");
    const wa = ctx.measureText(a).width;
    const wb = ctx.measureText(b).width;
    if (wa > largeur || wb > largeur) continue;
    if (Math.abs(wa - wb) < ecart) {
      ecart = Math.abs(wa - wb);
      meilleur = [a, b];
    }
  }
  return meilleur;
}

/** L'image contenue dans la boîte (sans recadrage), posée en bas (`bas`) ou au centre. */
async function poser(ctx: Ctx, chemin: string, x: number, y: number, l: number, h: number, ancre: "bas" | "centre") {
  const img = await image(chemin);
  const k = Math.min(l / img.width, h / img.height);
  const w = img.width * k;
  const hh = img.height * k;
  const px = x + (l - w) / 2;
  const py = ancre === "bas" ? y + h - hh : y + (h - hh) / 2;
  ctx.drawImage(img, px, py, w, hh);
  return { x: px, y: py, l: w, h: hh };
}

// --- La couverture -------------------------------------------------------------

/**
 * Ses mesures (« 6 WAYS TO BECOME A BETTER LOOKING MAN ») : capitales de 63 px
 * (League Spartan Bold 88 px), lignes tous les 97 px, la première en haut à
 * y 124 ; l'homme détouré de y 403 au bas de la slide, sur 1 040 px de large.
 */
const COUV = { taille: 88, pas: 97, haut: 124, largeur: 900, ecartImage: 22, image: { x: 20, l: 1040 } };

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  policeTitre(ctx, COUV.taille);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  const lignes = couper(ctx, c.titre, COUV.largeur);
  if (lignes.length > 4) throw new Error(`« ${c.titre} » : titre sur plus de quatre lignes`);
  const asc = ctx.measureText("H").actualBoundingBoxAscent;
  for (const [i, l] of lignes.entries()) ctx.fillText(l, L / 2, COUV.haut + asc + i * COUV.pas);
  const bas = COUV.haut + asc + (lignes.length - 1) * COUV.pas;
  const haut = bas + COUV.ecartImage;
  await poser(ctx, s.image, COUV.image.x, haut, COUV.image.l, H - haut, "bas");
}

// --- Les conseils ----------------------------------------------------------------

/**
 * Ses mesures (« 2. Have a bright smile ») : titre League Spartan Bold 81 px,
 * ligne de base à y 300, deux lignes tous les 84 px ; texte IBM Plex Sans 50 px
 * centré sur 740 px, lignes tous les 65 px, première ligne de base 122 sous la
 * dernière du titre ; l'image ~88 px sous le texte, jusqu'à y 1246 (un buste,
 * 640 px de large) ; un objet est posé au milieu de l'espace libre.
 */
const CONS = {
  titre: { taille: 81, base: 300, pas: 84, largeur: 920 },
  texte: { taille: 50, pas: 65, largeur: 740, sous: 122 },
  image: { ecart: 88, bas: 1246, l: 760, buste: 600, objet: 420, min: 330 },
  logo: { cote: 170, marge: 40 },
};

async function conseil(ctx: Ctx, s: Slide, c: TexteConseil) {
  policeTitre(ctx, CONS.titre.taille);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  const lignesTitre = equilibrer(ctx, c.titre, CONS.titre.largeur);
  if (lignesTitre.length > 2) throw new Error(`« ${c.titre} » : titre sur plus de deux lignes`);
  // Deux lignes de titre : on remonte d'une demi-ligne pour garder l'équilibre de la slide.
  const base0 = CONS.titre.base - (lignesTitre.length - 1) * (CONS.titre.pas / 2);
  for (const [i, l] of lignesTitre.entries()) ctx.fillText(l, L / 2, base0 + i * CONS.titre.pas);
  const baseTitre = base0 + (lignesTitre.length - 1) * CONS.titre.pas;

  policeTexte(ctx, CONS.texte.taille);
  ctx.fillStyle = TEXTE;
  const lignes = couper(ctx, c.texte, CONS.texte.largeur);
  const base1 = baseTitre + CONS.texte.sous;
  for (const [i, l] of lignes.entries()) ctx.fillText(l, L / 2, base1 + i * CONS.texte.pas);
  const finTexte = base1 + (lignes.length - 1) * CONS.texte.pas;

  const haut = finTexte + CONS.image.ecart;
  const hDispo = CONS.image.bas - haut;
  if (hDispo < CONS.image.min) throw new Error(`« ${c.titre} » : texte trop long, l'image n'a plus la place (raccourcis)`);
  const mode = s.mode ?? (s.atala ? "objet" : "bas");
  if (mode === "bas") {
    // Un buste comme les siens : à la largeur `taille` (600 par défaut), posé en bas, coupé par le bas s'il dépasse.
    const img = await image(s.image);
    const w = Math.min(s.taille ?? CONS.image.buste, CONS.image.l);
    const hh = (img.height * w) / img.width;
    const y = Math.max(haut, CONS.image.bas - hh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, haut, L, CONS.image.bas - haut);
    ctx.clip();
    ctx.drawImage(img, (L - w) / 2, y, w, hh);
    ctx.restore();
  } else {
    const t = Math.min(s.taille ?? CONS.image.objet, hDispo);
    const pose = await poser(ctx, s.image, (L - t) / 2, haut + (hDispo - t) / 2, t, t, "centre");
    if (s.atala) {
      // Le logo d'Atala à droite du coureur, à hauteur de ses épaules (ses icônes autour d'un personnage).
      const k = CONS.logo;
      const x = Math.min(L - k.marge - k.cote, pose.x + pose.l + 10);
      const y = pose.y + Math.max(0, pose.h * 0.08);
      ctx.save();
      rectArrondi(ctx, x, y, k.cote, k.cote, k.cote * 0.2237);
      ctx.clip();
      ctx.drawImage(await image(ICONE_ATALA), x, y, k.cote, k.cote);
      ctx.restore();
      // Un filet gris très fin autour, comme une icône posée sur du blanc.
      ctx.strokeStyle = "#e4e4e4";
      ctx.lineWidth = 2;
      rectArrondi(ctx, x, y, k.cote, k.cote, k.cote * 0.2237);
      ctx.stroke();
    }
  }
}

// --- La fin ------------------------------------------------------------------------

/** Ses mesures : « Follow for more » Arimo 83 px, ligne de base y 512 ; l'homme détouré de y 629 au bas. */
const FIN = { taille: 83, base: 512, image: { haut: 629, l: 620 } };

async function fin(ctx: Ctx, s: Slide, c: TexteFin) {
  policeTexte(ctx, FIN.taille, POLICE.fin);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.fillText(c.texte, L / 2, FIN.base);
  await poser(ctx, s.image, (L - FIN.image.l) / 2, FIN.image.haut, FIN.image.l, H - FIN.image.haut, "bas");
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
  else if (s.type === "conseil") await conseil(ctx, s, c as TexteConseil);
  else if (s.type === "fin") await fin(ctx, s, c as TexteFin);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
