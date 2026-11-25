// Le rendu des slides du podz 30, au style exact de @highlevelgame_ (mesuré le
// 25/11 sur ses slides de 1080 × 1350) :
// - le fond : un papier blanc cassé grainé (images/fonds/papier.jpg, Seedream,
//   teinté à son gris chaud) ; tout le texte en Vollkorn bordeaux ;
// - la couverture : le titre en CAPITALES centré (Medium 75 px, une ligne tous
//   les 99 px, centré sur la hauteur) ;
// - un conseil : son titre en gras (SemiBold 47 px, « Remember small
//   details. »), puis des paragraphes (Regular 46 px, une ligne tous les 52 px,
//   une ligne vide entre deux), à x = 93, le bloc centré sur la hauteur ; ses
//   mots en gras entre ** ; la main « swipe » en bas à droite ;
// - la carte Artura : un conseil (« Know how to talk about art. ») avec un vrai
//   tableau du domaine public entre ses paragraphes et le LOGO d'Artura à
//   droite du tableau ; jamais une capture de l'appli ;
// - la fin : « Follow so you don't miss what's next. » centré, « Follow » en
//   gras, et une flèche tracée à la main.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1350;

const ENCRE = "#6B2224";
const PAPIER = "images/fonds/papier.jpg";
const LOGO_ARTURA = "assets/artura/icone.png";

export type TypeSlide = "couverture" | "conseil" | "artura" | "suivre";
export type Slide = {
  type: TypeSlide;
  /** La carte Artura : le tableau (images/oeuvres/…). */
  image?: string;
  [langue: string]: unknown;
};

export type TexteCouverture = { titre: string };
/** Un conseil : `titre` en gras (facultatif), puis les paragraphes (« \n » force une ligne, ** met en gras). */
export type TexteConseil = { titre?: string; paragraphes: string[] };
/** La carte Artura : le titre, les paragraphes avant le tableau, ceux d'après (la phrase Artura). */
export type TexteArtura = { titre: string; avant: string[]; apres: string[] };
/** La fin : `gras` (« Follow »), `milieu` (« so you don't miss », l'anglais par défaut), `suite` (« what's next. »). */
export type TexteSuivre = { gras: string; milieu?: string; suite: string };

export type Source = { musee: string; id: string; titre: string; artiste: string; date: string; url: string };

export type Post = {
  id: string;
  /** Le post du compte modèle qui sert de preuve (format et accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Le tableau de la carte Artura : chemin local → sa fiche au musée (domaine public vérifié). */
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
/** La slide de l'appli, que l'OS marque `position_app: "artura"`. */
export const estSlideApp = (s: Slide) => s.type === "artura";
export const photosSlide = (s: Slide): string[] => (s.image ? [s.image] : []);
const sansGras = (t: string) => t.replace(/\*\*/g, "").replace(/\n/g, " ");

export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return sansGras((c as TexteCouverture).titre);
  if (s.type === "suivre") return `${(c as TexteSuivre).gras}${(c as TexteSuivre).milieu ?? " so you don't miss"} ${(c as TexteSuivre).suite}`;
  if (s.type === "artura") {
    const t = c as TexteArtura;
    return sansGras([t.titre, ...t.avant, ...t.apres].join(" "));
  }
  const t = c as TexteConseil;
  return sansGras([t.titre ?? "", ...t.paragraphes].filter(Boolean).join(" "));
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

// --- Le texte : des lignes faites de morceaux réguliers ou gras -------------------

type Morceau = { t: string; gras: boolean };
const TEXTE = { x: 93, taille: 46, pas: 52, largeur: 760, titre: 47 } as const;
const police = (taille: number, gras: boolean) => `${taille}px "${gras ? POLICE.gras : POLICE.texte}"`;

/** « Don't text to be answered.\nA **boy** fills silence. » → des lignes de morceaux, coupées sur `largeur`. */
function lignesDe(ctx: Ctx, texte: string, taille: number, largeur: number): Morceau[][] {
  const lignes: Morceau[][] = [];
  for (const forcee of texte.split("\n")) {
    // Les mots, chacun fait de morceaux (un mot peut changer de graisse : « **Follow**, »).
    const mots: Morceau[][] = [];
    let gras = false;
    let cur: Morceau[] = [];
    for (const [i, bout] of forcee.split("**").entries()) {
      if (i > 0) gras = !gras;
      for (const p of bout.split(/(\s+)/)) {
        if (!p) continue;
        if (/^\s+$/.test(p)) {
          if (cur.length) mots.push(cur);
          cur = [];
        } else cur.push({ t: p, gras });
      }
    }
    if (cur.length) mots.push(cur);
    if (gras) throw new Error(`« ${texte.slice(0, 40)}… » : un ** n'est pas refermé`);
    const l = (ms: Morceau[][]) => {
      let w = 0;
      for (const [k, m] of ms.entries()) {
        for (const x of m) {
          ctx.font = police(taille, x.gras);
          w += ctx.measureText(x.t).width;
        }
        if (k < ms.length - 1) {
          ctx.font = police(taille, false);
          w += ctx.measureText(" ").width;
        }
      }
      return w;
    };
    let ligne: Morceau[][] = [];
    for (const m of mots) {
      if (ligne.length && l([...ligne, m]) > largeur) {
        lignes.push(ligne.flatMap((mm, k) => (k ? [{ t: " ", gras: false }, ...mm] : mm)));
        ligne = [m];
      } else ligne.push(m);
    }
    lignes.push(ligne.flatMap((mm, k) => (k ? [{ t: " ", gras: false }, ...mm] : mm)));
  }
  return lignes;
}

function largeurLigne(ctx: Ctx, ligne: Morceau[], taille: number): number {
  return ligne.reduce((w, m) => {
    ctx.font = police(taille, m.gras);
    return w + ctx.measureText(m.t).width;
  }, 0);
}

function ecrireLigne(ctx: Ctx, ligne: Morceau[], x: number, y: number, taille: number) {
  let cx = x;
  for (const m of ligne) {
    ctx.font = police(taille, m.gras);
    ctx.fillText(m.t, cx, y);
    cx += ctx.measureText(m.t).width;
  }
}

// --- Les ornements : la main « swipe » et la flèche de la fin ------------------------

/** Sa main (931–999, 1181–1260) : la main qui montre du doigt (Noto Emoji) et une petite flèche courbe au-dessus. */
function main(ctx: Ctx) {
  ctx.save();
  ctx.fillStyle = ENCRE;
  ctx.font = `66px "${POLICE.emoji}"`;
  ctx.fillText("👆", 930, 1258);
  ctx.strokeStyle = ENCRE;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(992, 1186);
  ctx.quadraticCurveTo(968, 1176, 950, 1190);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(950, 1190);
  ctx.lineTo(962, 1189);
  ctx.moveTo(950, 1190);
  ctx.lineTo(954, 1179);
  ctx.stroke();
  ctx.restore();
}

/** Sa flèche (591–868, 730–825) : un trait de pinceau qui monte vers la droite et sa pointe. */
function fleche(ctx: Ctx) {
  ctx.save();
  ctx.strokeStyle = ENCRE;
  ctx.fillStyle = ENCRE;
  ctx.lineCap = "round";
  for (const [k, w] of [[0, 9], [3, 6]] as const) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(596, 806 + k);
    ctx.bezierCurveTo(680, 838 + k, 790, 812 + k, 850, 760);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(866, 742);
  ctx.lineTo(818, 754);
  ctx.lineTo(852, 790);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- Les slides ------------------------------------------------------------------------

/** Ses mesures (« HOW TO / GIVE A GIRL / BUTTERFLIES. ») : Medium 75 px, centré, lignes de base
 * tous les 99 px, la ligne du milieu à 673 (le bloc centré sur la hauteur). */
function couverture(ctx: Ctx, c: TexteCouverture) {
  const lignes = c.titre.split("\n");
  if (lignes.length > 4) throw new Error("couverture : quatre lignes au plus");
  if (c.titre !== c.titre.toUpperCase()) throw new Error(`couverture : en CAPITALES (« ${c.titre.toUpperCase()} »)`);
  ctx.font = `75px "${POLICE.titre}"`;
  ctx.textAlign = "center";
  const y0 = 673 - ((lignes.length - 1) * 99) / 2 + 0;
  for (const [i, l] of lignes.entries()) {
    if (ctx.measureText(l).width > 900) throw new Error(`couverture : « ${l} » trop long, coupe la ligne`);
    ctx.fillText(l, L / 2, y0 + i * 99);
  }
  ctx.textAlign = "left";
}

/** Un bloc de conseil : le titre gras, une ligne vide, les paragraphes séparés d'une ligne vide. Rend sa hauteur. */
function hauteurParagraphes(ctx: Ctx, paragraphes: string[]): number {
  return paragraphes.reduce((h, p, k) => h + lignesDe(ctx, p, TEXTE.taille, TEXTE.largeur).length * TEXTE.pas + (k ? TEXTE.pas : 0), 0);
}
function ecrireParagraphes(ctx: Ctx, paragraphes: string[], y: number): number {
  for (const [k, p] of paragraphes.entries()) {
    if (k) y += TEXTE.pas;
    for (const l of lignesDe(ctx, p, TEXTE.taille, TEXTE.largeur)) {
      ecrireLigne(ctx, l, TEXTE.x, y, TEXTE.taille);
      y += TEXTE.pas;
    }
  }
  return y;
}

/** Ses mesures (« Remember small details. ») : à x = 93, le titre SemiBold 47 px, une ligne vide, le texte
 * Regular 46 px, une ligne tous les 52 px ; le bloc centré sur y = 660. */
function conseil(ctx: Ctx, c: TexteConseil) {
  const titre = c.titre ? TEXTE.pas * 2 : 0;
  const h = titre + hauteurParagraphes(ctx, c.paragraphes);
  if (h > 900) throw new Error(`« ${c.titre ?? c.paragraphes[0]} » : texte trop long (${h} px de haut, 900 au plus)`);
  let y = Math.round(660 - h / 2 + TEXTE.taille * 0.72);
  if (c.titre) {
    ctx.font = `${TEXTE.titre}px "${POLICE.gras}"`;
    if (ctx.measureText(c.titre).width > L - 2 * TEXTE.x) throw new Error(`« ${c.titre} » : titre trop long pour une ligne`);
    ctx.fillText(c.titre, TEXTE.x, y);
    y += TEXTE.pas * 2;
  }
  ecrireParagraphes(ctx, c.paragraphes, y);
  main(ctx);
}

/** La carte Artura : le titre, les paragraphes d'avant, le tableau (400 px de large au plus, 380 de haut),
 * le logo d'Artura (110 px) à droite du tableau, calé sur son bas, puis les paragraphes d'après. */
const TABLEAU = { l: 400, h: 380, ecart: 34, logo: 110 } as const;
async function artura(ctx: Ctx, s: Slide, c: TexteArtura) {
  if (!s.image) throw new Error("carte Artura : le tableau (images/oeuvres/…)");
  const img = await image(s.image);
  const k = Math.min(TABLEAU.l / img.width, TABLEAU.h / img.height);
  const lt = Math.round(img.width * k);
  const ht = Math.round(img.height * k);
  const hAvant = hauteurParagraphes(ctx, c.avant);
  const hApres = hauteurParagraphes(ctx, c.apres);
  const h = TEXTE.pas * 2 + hAvant + TABLEAU.ecart + ht + TABLEAU.ecart + TEXTE.pas * 0.4 + hApres;
  if (h > 1000) throw new Error(`« ${c.titre} » : trop haut (${Math.round(h)} px, 1000 au plus) : raccourcis le texte`);
  let y = Math.round(660 - h / 2 + TEXTE.taille * 0.72);
  ctx.font = `${TEXTE.titre}px "${POLICE.gras}"`;
  if (ctx.measureText(c.titre).width > L - 2 * TEXTE.x) throw new Error(`« ${c.titre} » : titre trop long pour une ligne`);
  ctx.fillText(c.titre, TEXTE.x, y);
  y += TEXTE.pas * 2;
  y = ecrireParagraphes(ctx, c.avant, y);
  const yt = Math.round(y - TEXTE.pas + TEXTE.taille * 0.3 + TABLEAU.ecart);
  ctx.drawImage(img, TEXTE.x, yt, lt, ht);
  const lg = TABLEAU.logo;
  ctx.save();
  rectArrondi(ctx, TEXTE.x + lt + 28, yt + ht - lg, lg, lg, lg * 0.2237);
  ctx.clip();
  ctx.drawImage(await image(LOGO_ARTURA), TEXTE.x + lt + 28, yt + ht - lg, lg, lg);
  ctx.restore();
  y = yt + ht + TABLEAU.ecart + TEXTE.taille * 0.72 + TEXTE.pas * 0.4;
  ecrireParagraphes(ctx, c.apres, Math.round(y));
  main(ctx);
}

/** Ses mesures : « **Follow** so you don't miss / what's next. » centré, la première ligne de 711 px,
 * lignes de base à 645 et 717, la flèche dessous à droite. */
function suivre(ctx: Ctx, c: TexteSuivre) {
  const l1: Morceau[] = [{ t: c.gras, gras: true }, { t: c.milieu ?? " so you don't miss", gras: false }];
  const l2: Morceau[] = [{ t: c.suite, gras: false }];
  const taille = Math.round((46 * 711) / largeurLigne(ctx, l1, 46));
  const w1 = largeurLigne(ctx, l1, taille);
  const w2 = largeurLigne(ctx, l2, taille);
  ecrireLigne(ctx, l1, (L - w1) / 2, 645, taille);
  ecrireLigne(ctx, l2, (L - w2) / 2, 717, taille);
  fleche(ctx);
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(await image(PAPIER), 0, 0, L, H);
  ctx.fillStyle = ENCRE;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") couverture(ctx, c as TexteCouverture);
  else if (s.type === "conseil") conseil(ctx, c as TexteConseil);
  else if (s.type === "artura") await artura(ctx, s, c as TexteArtura);
  else if (s.type === "suivre") suivre(ctx, c as TexteSuivre);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
