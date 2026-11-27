// Le rendu des slides du podz 32, au style exact de @msclzz (mesuré le 27/11
// sur ses slides de 1170 × 2080 ; toutes les mesures ci-dessous sont dans ce
// repère, le rendu sort en 1080 × 1920) :
// - fond noir pur, texte blanc, des mots ou des phrases en violet (#8A54FA,
//   `{…}` dans le texte) ou en rouge (`[…]`, son avertissement) ;
// - la couverture : « How To Make People {Remember You} » (Manrope 60,7 px, casse de
//   titre) puis son image ; jamais sa signature ni le nom de son ebook ;
// - l'avertissement : « DISCLAIMER » en violet, « READ THIS BEFORE YOU USE
//   IT », des paragraphes, puis une image ;
// - une étape : un titre en capitales aux mots en violet (Manrope Bold,
//   62 px, lignes tous les 84 px), des paragraphes courts (Golos Text
//   SemiBold, 45 px, lignes tous les 60,5 px, une ligne vide entre deux),
//   l'image noir et blanc détourée au centre, puis la suite ;
// - la slide Sophia : une étape dont l'image est le LOGO de Sophia (son
//   icône de l'App Store, coins arrondis) ; jamais une capture de l'appli.
// Le texte est calé à gauche (x = 60), coupé à 1050 px.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
/** Le repère de ses mesures (1170 × 2080), et la taille rendue. */
export const REPERE = 1170;
export const L = 1080;
export const H = 1920;
const K = L / REPERE;

const COULEURS = { blanc: "#FFFFFF", violet: "#8A54FA", rouge: "#FF3B3B" } as const;
const X = 60;
const LARGEUR = 1050;
const FIN = 1950;
const TITRE = { taille: 62, pas: 84, base: 305 } as const;
const COUV = { taille: 60.7, pas: 82, base: 455, image: 806 } as const;
const TEXTE = { taille: 45, pas: 60.5 } as const;
/** Titre → première ligne du texte ; ligne → image ; image → ligne suivante (lignes de base). */
const ECARTS = { titre_texte: 112, surtitre_titre: 138, avertissement_texte: 160, avant_image: 70, image_apres: 125 } as const;
/** L'image : sa taille chez lui (ses découpes font 480 à 870 px de large), bornée. */
const IMAGE = { l: 900, h: 760 } as const;
const LOGO = 300;
const ICONE_SOPHIA = "assets/sophia/icone.jpg";

export type TypeSlide = "couverture" | "avertissement" | "etape" | "sophia";
export type Slide = {
  type: TypeSlide;
  /** Son image (images/compte/<nom>.jpg, provenance dans `compte` du post) ou une photo de la banque (images/banque/, id dans `banque`). La slide Sophia n'en a pas (son logo). */
  image?: string;
  [langue: string]: unknown;
};
export type TexteCouverture = { titre: string };
export type TexteEtape = { surtitre?: string; titre: string; avant?: string[]; apres?: string[] };

export type Post = {
  id: string;
  /** Son post qui sert de preuve (le format et le texte qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Ses images reprises : chemin local → son post et le numéro de la slide. */
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
export const photosSlide = (s: Slide): string[] => (s.image ? [s.image] : []);

const sansBalises = (t: string) => t.replace(/[{}[\]]/g, "");
export function textesSlide(_post: Post, s: Slide, langue: string): string {
  const c = contenu<TexteEtape>(s, langue);
  return sansBalises([c.surtitre, c.titre, ...(c.avant ?? []), ...(c.apres ?? [])].filter(Boolean).join(" — "));
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

// --- Le texte en couleurs, coupé en lignes ---------------------------------------

type Mot = { t: string; c: keyof typeof COULEURS };

/** « Then you {left} before… [it works] » → des mots colorés (une balise peut couvrir plusieurs mots). */
function mots(t: string): Mot[] {
  const sortie: Mot[] = [];
  let c: keyof typeof COULEURS = "blanc";
  for (const brut of t.split(/\s+/).filter(Boolean)) {
    let m = brut;
    let couleur = c;
    if (m.startsWith("{")) (couleur = "violet"), (c = "violet"), (m = m.slice(1));
    if (m.startsWith("[")) (couleur = "rouge"), (c = "rouge"), (m = m.slice(1));
    if (m.endsWith("}") || m.endsWith("]")) (m = m.slice(0, -1)), (c = "blanc");
    if (/[{}[\]]/.test(m)) throw new Error(`balise mal placée dans « ${t} » (\`{…}\` violet, \`[…]\` rouge, autour de mots entiers)`);
    sortie.push({ t: m, c: couleur });
  }
  if (c !== "blanc") throw new Error(`balise non fermée dans « ${t} »`);
  return sortie;
}

function couper(ctx: Ctx, ms: Mot[], largeur: number): Mot[][] {
  const lignes: Mot[][] = [];
  let cur: Mot[] = [];
  const l = (xs: Mot[]) => ctx.measureText(xs.map((m) => m.t).join(" ")).width;
  for (const m of ms) {
    if (cur.length && l([...cur, m]) > largeur) (lignes.push(cur), (cur = [m]));
    else cur.push(m);
  }
  if (cur.length) lignes.push(cur);
  return lignes;
}

function ecrireLigne(ctx: Ctx, ms: Mot[], x: number, y: number) {
  let cx = x;
  const espace = ctx.measureText(" ").width;
  for (const m of ms) {
    ctx.fillStyle = COULEURS[m.c];
    ctx.fillText(m.t, cx, y);
    cx += ctx.measureText(m.t).width + espace;
  }
}

/** Un bloc (titre ou paragraphe) ; rend la ligne de base de sa dernière ligne. */
function bloc(ctx: Ctx, t: string, police: string, taille: number, pas: number, y: number): number {
  ctx.font = `${taille}px "${police}"`;
  const lignes = couper(ctx, mots(t), LARGEUR);
  for (const [i, l] of lignes.entries()) ecrireLigne(ctx, l, X, y + i * pas);
  return y + (lignes.length - 1) * pas;
}

/** Des paragraphes à partir de la ligne de base `y` ; rend la dernière ligne de base. */
function paragraphes(ctx: Ctx, ps: string[], y: number): number {
  let base = y;
  for (const [i, p] of ps.entries()) base = bloc(ctx, p, POLICE.texte, TEXTE.taille, TEXTE.pas, i === 0 ? base : base + 2 * TEXTE.pas);
  return base;
}

/** L'image au centre, à sa taille chez lui (bornée) ; rend son bas. */
async function poserImage(ctx: Ctx, chemin: string | null, haut: number): Promise<number> {
  if (!chemin) {
    const x = (REPERE - LOGO) / 2;
    ctx.save();
    rectArrondi(ctx, x, haut, LOGO, LOGO, LOGO * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(ICONE_SOPHIA), x, haut, LOGO, LOGO);
    ctx.restore();
    return haut + LOGO;
  }
  const img = await image(chemin);
  // Ses découpes sont gardées à leur taille chez lui (repère 1170) : on les pose telles quelles, bornées.
  const k = Math.min(1, IMAGE.l / img.width, IMAGE.h / img.height);
  const l = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, (REPERE - l) / 2, haut, l, h);
  return haut + h;
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const n = post.slides.indexOf(s) + 1;
  const ou = `${post.id} slide ${n}`;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, L, H);
  ctx.save();
  ctx.scale(K, K);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  let bas: number;
  if (s.type === "couverture") {
    const c = contenu<TexteCouverture>(s, langue);
    if (!c?.titre) throw new Error(`${ou} : le titre de la couverture en ${langue}`);
    if (!s.image) throw new Error(`${ou} : la couverture a son image`);
    const fin = bloc(ctx, c.titre, POLICE.titre, COUV.taille, COUV.pas, COUV.base);
    bas = await poserImage(ctx, s.image, Math.max(COUV.image, fin + 200));
  } else if (s.type === "avertissement" || s.type === "etape" || s.type === "sophia") {
    const c = contenu<TexteEtape>(s, langue);
    if (!c?.titre) throw new Error(`${ou} : le titre en ${langue}`);
    if (s.type === "sophia" && s.image) throw new Error(`${ou} : la slide Sophia n'a pas d'image (son logo est posé au rendu)`);
    if (s.type === "avertissement" && !c.surtitre) throw new Error(`${ou} : l'avertissement a son surtitre (« DISCLAIMER »)`);
    let y: number = TITRE.base;
    if (c.surtitre) {
      ctx.font = `${TITRE.taille}px "${POLICE.titre}"`;
      ecrireLigne(ctx, mots(`{${c.surtitre}}`), X, y);
      y += ECARTS.surtitre_titre;
    }
    y = bloc(ctx, c.titre, POLICE.titre, TITRE.taille, TITRE.pas, y);
    if (couper(ctx, mots(c.titre), LARGEUR).length > 3) throw new Error(`${ou} : trois lignes de titre au plus`);
    y += s.type === "avertissement" ? ECARTS.avertissement_texte : ECARTS.titre_texte;
    if (c.avant?.length) y = paragraphes(ctx, c.avant, y) + ECARTS.avant_image;
    else y -= 33;
    if (s.image || s.type === "sophia") {
      const fin = await poserImage(ctx, s.type === "sophia" ? null : s.image!, y);
      y = fin + ECARTS.image_apres;
    } else y += 2 * TEXTE.pas - ECARTS.avant_image;
    bas = c.apres?.length ? paragraphes(ctx, c.apres, y) : y - ECARTS.image_apres;
  } else throw new Error(`${ou} : type de slide inconnu : ${s.type}`);
  if (bas > FIN) throw new Error(`${ou} : le contenu descend jusqu'à y = ${Math.round(bas)} (fin à ${FIN}) : raccourcis le texte ou prends une image plus petite`);
  ctx.restore();

  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
