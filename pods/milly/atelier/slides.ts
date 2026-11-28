// Un original (posts/<id>.json) et le rendu de ses slides, au style exact de
// @bdnf.milly (relevé du 19/11), en 1080 × 1920 :
// - un fond uni par post (noir, gris, gris clair, vert, vert foncé, bleu, brun,
//   orange, rouge), le texte blanc (noir sur les fonds clairs), une seule
//   police : Cormorant Garamond Regular ;
// - la couverture : un filet en haut, un en bas, et entre les deux des mots de
//   tailles différentes (« Habits » / « that increase » / [image] /
//   « Intelligence »), répartis à intervalles égaux, une petite image au milieu ;
// - les slides de contenu : un titre centré (une ou deux lignes), un filet,
//   puis des paragraphes alignés à gauche, une petite image centrée entre deux
//   paragraphes, parfois une liste à puces, et un large filet en bas ;
// - la slide Sophia (demande d'Adrien du 19/11) : une slide de contenu comme
//   les autres, avec le LOGO de Sophia à la place de l'image (jamais une
//   capture de l'appli).
// Toutes les mesures sont prises sur ses slides de 1080 × 1920 (calées au
// pixel sur « Habits that increase Intelligence » et « The secret to
// Memorizing Anything »).

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1920;

/**
 * Ses fonds (relevés le 19/11), un par post, et la couleur de son texte :
 * blanc partout, noir sur le gris clair (« How to make your brain learn
 * faster ») et, au choix, sur le gris (`gris_noir`, « How to quit
 * Doomscrolling »).
 */
export const FONDS = {
  noir: { fond: "#000000", texte: "#ffffff", puce: "#ff9a3c" },
  gris: { fond: "#808080", texte: "#ffffff", puce: "#ffe08a" },
  gris_noir: { fond: "#808080", texte: "#000000", puce: "#7a1f00" },
  gris_clair: { fond: "#c0c0c0", texte: "#000000", puce: "#8a2be2" },
  vert: { fond: "#007c00", texte: "#ffffff", puce: "#ffb347" },
  vert_fonce: { fond: "#05402a", texte: "#ffffff", puce: "#ffb347" },
  bleu: { fond: "#0099ff", texte: "#000000", puce: "#ffffff" },
  brun: { fond: "#804000", texte: "#ffffff", puce: "#ffe08a" },
  orange: { fond: "#fe5e00", texte: "#ffffff", puce: "#ffe08a" },
  rouge: { fond: "#fe0000", texte: "#ffffff", puce: "#ffe08a" },
  // Relevés à la veille du 23/11 (ses posts d'octobre et novembre).
  bordeaux: { fond: "#800000", texte: "#ffffff", puce: "#ffe08a" },
  creme: { fond: "#feffef", texte: "#000000", puce: "#7a1f00" },
  chocolat: { fond: "#d3691f", texte: "#000000", puce: "#7a1f00" },
  vert_mer: { fond: "#2e8a57", texte: "#000000", puce: "#ffe08a" },
  saumon: { fond: "#fa8071", texte: "#000000", puce: "#7a1f00" },
  sarcelle: { fond: "#008081", texte: "#ffffff", puce: "#ffe08a" },
} as const;
export type Fond = keyof typeof FONDS;

const ICONE_SOPHIA = "assets/sophia/icone.jpg";

export type TypeSlide = "couverture" | "contenu";
/** Une ligne de la couverture : `grand` (son mot principal, ~150 px), `moyen` (~92), `petit` (« that increase », 75). */
export type LigneCouverture = { t: string; taille: "grand" | "moyen" | "petit" };
export type TexteCouverture = { lignes: LigneCouverture[]; image_apres: number };
/**
 * Un bloc d'une slide de contenu, dans l'ordre :
 * - `{ "p": "…" }` un paragraphe ;
 * - `{ "image": "images/irm-sagittale.jpg", "l"?: 340, "h"?: 300 }` une petite image centrée
 *   (`"image": "sophia"` : le logo de Sophia, sur sa slide seulement) ;
 * - `{ "puces": ["…", "…"] }` une liste à puces (« * » de couleur).
 */
export type Bloc = { p: string } | { image: string; l?: number; h?: number } | { puces: string[] };
export type TexteContenu = { titre: string; blocs: Bloc[] };
/**
 * Une slide. Le fond est celui du post (`fond`). Les textes (et les blocs, avec
 * leurs images) sont sous la clé de chaque langue :
 * - couverture : `image` ; texte `{ "lignes": [{ "t": "How to", "taille": "petit" }, …], "image_apres": 2 }` ;
 * - contenu : texte `{ "titre": "…", "blocs": [ { "p": "…" }, { "image": "…" }, … ] }` ;
 *   `"sophia": true` sur LA slide Sophia (son logo dans les blocs : `{ "image": "sophia" }`).
 */
export type Slide = { type: TypeSlide; image?: string; sophia?: boolean; [langue: string]: unknown };

export type Post = {
  id: string;
  /** Le post du compte modèle qui sert de preuve (format et accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  fond: Fond;
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
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
/** La slide Sophia, que l'OS marque `position_sophia`. */
export const estSlideSophia = (s: Slide) => s.sophia === true;
/** Les images d'une slide dans une langue (le logo de Sophia compris, noté « sophia »). */
export function imagesSlide(s: Slide, langue: string): string[] {
  if (s.type === "couverture") return s.image ? [s.image] : [];
  const c = contenu<TexteContenu>(s, langue);
  return (c?.blocs ?? []).flatMap((b) => ("image" in b ? [b.image] : []));
}
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) return "";
  if (s.type === "couverture") return (c as TexteCouverture).lignes.map((l) => l.t).join(" ");
  const t = c as TexteContenu;
  return [t.titre, ...t.blocs.flatMap((b) => ("p" in b ? [b.p] : "puces" in b ? b.puces : []))].join(" — ");
}

// ---------------------------------------------------------------------------

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

const cache = new Map<string, Image>();
async function image(chemin: string): Promise<Image> {
  const f = join(RACINE, chemin === "sophia" ? ICONE_SOPHIA : chemin);
  if (!existsSync(f)) throw new Error(`image introuvable : ${chemin}`);
  if (!cache.has(f)) cache.set(f, await loadImage(f));
  return cache.get(f)!;
}

/** La boîte remplie par l'image (recadrée au centre). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number) {
  const k = Math.max(l / img.width, h / img.height);
  const lw = l / k;
  const hh = h / k;
  ctx.drawImage(img, (img.width - lw) / 2, (img.height - hh) / 2, lw, hh, x, y, l, h);
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

const police = (taille: number) => `${taille}px "${POLICE.texte}"`;

function couper(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const para of t.split("\n")) {
    let ligne = "";
    for (const mot of para.split(/[^\S\u00a0]+/).filter(Boolean)) {
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

// --- La couverture -------------------------------------------------------------

/**
 * Ses mesures (« The secret to Memorizing Anything », « How to Study for 10+
 * Hours », « Habits that increase Intelligence ») : filets de 902 × 6 à y 200
 * et 1712 (738 × 4 sur le vert) ; « Habits » 161 px, « that increase » 75, « Intelligence »
 * 148 (sa largeur la borne) ; une image de 366 × 320 ; tous ces éléments à
 * intervalles égaux entre les filets (~180 px).
 */
const COUV = {
  filet: { x0: 89, x1: 991, e: 6, haut: 200, bas: 1712 },
  tailles: { grand: 160, moyen: 92, petit: 75 },
  largeurMax: 840,
  image: { l: 366, h: 320 },
};

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture, fond: Fond) {
  const BLANC = FONDS[fond].texte;
  if (!s.image) throw new Error("couverture : pas d'image");
  if (c.image_apres < 0 || c.image_apres > c.lignes.length) throw new Error("couverture : image_apres hors des lignes");
  ctx.fillStyle = BLANC;
  ctx.fillRect(COUV.filet.x0, COUV.filet.haut, COUV.filet.x1 - COUV.filet.x0, COUV.filet.e);
  ctx.fillRect(COUV.filet.x0, COUV.filet.bas, COUV.filet.x1 - COUV.filet.x0, COUV.filet.e);
  // Chaque élément : sa hauteur visible (le haut des lettres à la ligne de base, ou l'image).
  type El = { h: number; dessiner: (haut: number) => Promise<void> | void };
  const els: El[] = c.lignes.map((ligne) => {
    let taille = COUV.tailles[ligne.taille];
    ctx.font = police(taille);
    const w = ctx.measureText(ligne.t).width;
    if (w > COUV.largeurMax) taille = Math.floor((taille * COUV.largeurMax) / w);
    ctx.font = police(taille);
    const m = ctx.measureText(ligne.t);
    const asc = m.actualBoundingBoxAscent;
    const desc = Math.max(0, m.actualBoundingBoxDescent);
    return {
      h: asc + desc,
      dessiner: (haut: number) => {
        ctx.font = police(taille);
        ctx.fillStyle = BLANC;
        ctx.textAlign = "center";
        ctx.fillText(ligne.t, L / 2, haut + asc);
      },
    };
  });
  const img = await image(s.image);
  els.splice(c.image_apres, 0, {
    h: COUV.image.h,
    dessiner: (haut: number) => remplir(ctx, img, (L - COUV.image.l) / 2, haut, COUV.image.l, COUV.image.h),
  });
  const total = els.reduce((n, e) => n + e.h, 0);
  const espace = (COUV.filet.bas - (COUV.filet.haut + COUV.filet.e) - total) / (els.length + 1);
  if (espace < 40) throw new Error("couverture : trop de lignes, elles se touchent");
  let y = COUV.filet.haut + COUV.filet.e + espace;
  for (const e of els) {
    await e.dessiner(y);
    y += e.h + espace;
  }
}

// --- Les slides de contenu -------------------------------------------------------

/**
 * Ses mesures (« Sleep Is When Intelligence Is Consolidated ») : titre 74 px
 * centré, lignes de base 196 puis +88 ; filet de 673 × 4, 76 sous la dernière
 * ligne du titre ; texte 43 px, aligné à gauche à x 122 sur 836 px, lignes
 * tous les 51 px, première ligne de base 110 sous le filet, 73 px de plus entre
 * deux paragraphes ; large filet de 904 × 6 à y 1658. Une image : ~330 × 300,
 * centrée, à ~70 px du texte.
 */
const CONT = {
  titre: { taille: 74, base: 196, pas: 88, largeur: 880 },
  filet: { l: 673, e: 4, sous: 76 },
  texte: { taille: 43, pas: 51, x: 122, largeur: 836, premiere: 110, para: 73 },
  image: { l: 330, h: 300, ecart: 62 },
  logo: { cote: 260 },
  puce: { retrait: 34 },
  bas: { x0: 88, x1: 992, e: 6, y: 1658 },
};

/** Le titre sur une ligne, ou deux lignes de longueurs proches (jamais un mot seul en bas). */
function titreEquilibre(ctx: Ctx, t: string, largeur: number): string[] {
  if (ctx.measureText(t).width <= largeur) return [t];
  const mots = t.split(/[^\S\u00a0]+/);
  let meilleur: string[] | null = null;
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
  if (!meilleur) throw new Error(`« ${t} » : titre sur plus de deux lignes, raccourcis`);
  return meilleur;
}

async function contenuSlide(ctx: Ctx, s: Slide, c: TexteContenu, fond: Fond) {
  const BLANC = FONDS[fond].texte;
  const t = CONT.texte;
  // Le titre.
  ctx.font = police(CONT.titre.taille);
  ctx.fillStyle = BLANC;
  ctx.textAlign = "center";
  const lignesTitre = titreEquilibre(ctx, c.titre, CONT.titre.largeur);
  for (const [i, l] of lignesTitre.entries()) ctx.fillText(l, L / 2, CONT.titre.base + i * CONT.titre.pas);
  const baseTitre = CONT.titre.base + (lignesTitre.length - 1) * CONT.titre.pas;
  const yFilet = baseTitre + CONT.filet.sous;
  ctx.fillRect((L - CONT.filet.l) / 2, yFilet, CONT.filet.l, CONT.filet.e);

  // Les blocs, de haut en bas : `y` est la ligne de base de la prochaine ligne de texte.
  let y = yFilet + t.premiere;
  let precedent: "texte" | "image" | null = null;
  ctx.textAlign = "left";
  for (const b of c.blocs) {
    if ("p" in b || "puces" in b) {
      if (precedent === "texte") y += t.pas + t.para;
      else if (precedent === "image") y += t.taille * 0.72;
      ctx.font = police(t.taille);
      if ("p" in b) {
        const lignes = couper(ctx, b.p, t.largeur);
        for (const [i, l] of lignes.entries()) {
          ctx.fillStyle = BLANC;
          ctx.fillText(l, t.x, y + i * t.pas);
        }
        y += (lignes.length - 1) * t.pas;
      } else {
        let premiere = true;
        for (const item of b.puces) {
          if (!premiere) y += t.pas;
          premiere = false;
          ctx.fillStyle = FONDS[fond].puce;
          ctx.fillText("*", t.x, y);
          const lignes = couper(ctx, item, t.largeur - CONT.puce.retrait);
          for (const [i, l] of lignes.entries()) ctx.fillText(l, t.x + CONT.puce.retrait, y + i * t.pas);
          y += (lignes.length - 1) * t.pas;
        }
      }
      precedent = "texte";
    } else {
      const logo = b.image === "sophia";
      const l = logo ? CONT.logo.cote : (b.l ?? CONT.image.l);
      const h = logo ? CONT.logo.cote : (b.h ?? CONT.image.h);
      const haut = precedent === "texte" ? y + CONT.image.ecart : precedent === "image" ? y + CONT.image.ecart : yFilet + CONT.image.ecart + 20;
      const img = await image(b.image);
      const x = (L - l) / 2;
      if (logo) {
        // Le logo comme sur un téléphone : coins arrondis (22 %), sans rien autour.
        ctx.save();
        rectArrondi(ctx, x, haut, l, h, l * 0.2237);
        ctx.clip();
        ctx.drawImage(img, x, haut, l, h);
        ctx.restore();
      } else remplir(ctx, img, x, haut, l, h);
      y = haut + h + CONT.image.ecart;
      precedent = "image";
    }
    if (y > CONT.bas.y - 40) throw new Error(`« ${c.titre} » : le texte dépasse le filet du bas, raccourcis`);
  }
  ctx.fillStyle = BLANC;
  ctx.fillRect(CONT.bas.x0, CONT.bas.y, CONT.bas.x1 - CONT.bas.x0, CONT.bas.e);
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  if (!FONDS[post.fond]) throw new Error(`${post.id} : fond inconnu (${post.fond}) : ${Object.keys(FONDS).join(", ")}`);
  ctx.fillStyle = FONDS[post.fond].fond;
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture, post.fond);
  else if (s.type === "contenu") await contenuSlide(ctx, s, c as TexteContenu, post.fond);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
