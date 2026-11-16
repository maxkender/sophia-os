// Un original (posts/<id>.json) et le rendu de ses slides, au style exact de
// @iinspogiirly (relevé du 16/11 sur « 4 apps every girl needs », 1,3 M vues),
// en 1170 × 2080 (9:16, la taille de ses slides) :
// - la couverture : trois photos l'une sous l'autre, trois bandes égales de
//   1170 × 693 sans séparation (en haut des produits, au milieu une fille, en
//   bas des fleurs), et le titre en blanc au centre (« 4 apps every / girl
//   needs »), le texte natif de TikTok ;
// - une slide par appli, sur son blanc bleuté : le nom de l'appli, son icône
//   de l'App Store au centre (408 px, coins arrondis, filet gris), puis une
//   phrase qui dit ce qu'elle fait, en minuscules, centrée.
// Sophia est une des applis (sa vraie icône), jamais la première ni la dernière.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1170;
export const H = 2080;

/** Couleurs relevées sur ses slides (16/11). */
export const COULEUR = {
  /** Le fond des slides d'appli : un blanc à peine bleuté. */
  fond: "#f7fbfc",
  texte: "#000000",
  titre: "#ffffff",
  /** Le filet autour de l'icône (la capture de l'App Store). */
  filet: "rgba(0, 0, 0, 0.16)",
} as const;

/** Une photo de couverture : son chemin, ou `{ "src": …, "y": 0.3 }` pour choisir la hauteur du cadrage (0 = le haut, 1 = le bas). */
export type Photo = string | { src: string; y?: number; x?: number };
export type Couverture = {
  /** Trois photos, de haut en bas (produits, fille, fleurs chez lui). */
  photos: Photo[];
  /** Le titre, « \n » pour couper la ligne comme lui (« 4 apps every\ngirl needs »). */
  titre: string;
};
export type AppliSlide = {
  /** Le nom de l'appli, en minuscules comme lui (« closette », « glowmi makeup »). */
  nom: string;
  /** Ce qu'elle fait, une phrase en minuscules (« you can upload photos of your clothes and create outfits… ») ; « \n » force une ligne. */
  texte: string;
};

export type TypeSlide = "couverture" | "appli";
/** `dossier` : l'appli (`images/applis/<nom>`, `npm run appli -- --id`) ; Sophia : `"app": "sophia"` (assets/sophia/icone.jpg). */
export type Slide = { type: TypeSlide; app?: "sophia"; dossier?: string; [langue: string]: unknown };

export type Post = {
  id: string;
  /** Le post de @iinspogiirly qui sert de preuve (format et accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
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
/** La slide Sophia, que l'OS marque `position_sophia` : la slide d'appli de Sophia. */
export const estSlideSophia = (s: Slide) => s.app === "sophia" && s.type === "appli";

export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return (c as Couverture).titre.replace(/\n/g, " ");
  return `${(c as AppliSlide).nom} — ${(c as AppliSlide).texte.replace(/\n/g, " ")}`;
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

/** Remplit le cadre avec l'image (recadrée, jamais déformée), au point de cadrage (fx, fy). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number, fx = 0.5, fy = 0.5) {
  const k = Math.max(l / img.width, h / img.height);
  const lw = l / k;
  const hh = h / k;
  ctx.drawImage(img, (img.width - lw) * fx, (img.height - hh) * fy, lw, hh, x, y, l, h);
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

/** Coupe le texte en lignes de `largeur` px au plus ; « \n » force une ligne. */
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

// --- La couverture ----------------------------------------------------------

/** Ses mesures : trois bandes de 693 px, le titre en 62 px, 75 px entre les lignes, centré sur la bande du milieu. */
const COUV = { taille: 62, pas: 75, centre: 1057, largeurMax: 1000 };

async function couverture(ctx: Ctx, c: Couverture) {
  if (c.photos.length !== 3) throw new Error("la couverture prend trois photos (haut, milieu, bas)");
  for (const [i, p] of c.photos.entries()) {
    const ph = typeof p === "string" ? { src: p } : p;
    const y0 = Math.round((i * H) / 3);
    const y1 = Math.round(((i + 1) * H) / 3);
    remplir(ctx, await image(ph.src), 0, y0, L, y1 - y0, ph.x ?? 0.5, ph.y ?? 0.5);
  }
  ctx.fillStyle = COULEUR.titre;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let taille = COUV.taille;
  ctx.font = `${taille}px "${POLICE.texte}"`;
  const lignes = c.titre.split("\n");
  while (taille > 40 && Math.max(...lignes.map((l) => ctx.measureText(l).width)) > COUV.largeurMax) {
    taille -= 2;
    ctx.font = `${taille}px "${POLICE.texte}"`;
  }
  const pas = (COUV.pas * taille) / COUV.taille;
  const premiere = COUV.centre - ((lignes.length - 1) * pas) / 2;
  for (const [i, l] of lignes.entries()) ctx.fillText(l, L / 2, premiere + i * pas);
}

// --- Une slide d'appli -------------------------------------------------------

/**
 * Ses mesures (16/11) : le nom en 69 px, ligne de base à 795 ; l'icône de
 * 408 px centrée (381 → 789, 836 → 1244), coins de 92 px ; la phrase en 53 px,
 * 62 px entre les lignes, première ligne de base à 1320, 725 px de large au plus
 * (sa ligne la plus longue fait 712 px d'encre).
 */
const APP = { nom: { taille: 69, base: 795, largeurMax: 980 }, icone: { x: 381, y: 836, cote: 408, rayon: 92 }, texte: { taille: 53, pas: 62, base: 1320, largeur: 725 } };

async function appli(ctx: Ctx, s: Slide, c: AppliSlide) {
  ctx.fillStyle = COULEUR.fond;
  ctx.fillRect(0, 0, L, H);
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let taille = APP.nom.taille;
  ctx.font = `${taille}px "${POLICE.texte}"`;
  while (taille > 44 && ctx.measureText(c.nom).width > APP.nom.largeurMax) {
    taille -= 2;
    ctx.font = `${taille}px "${POLICE.texte}"`;
  }
  ctx.fillText(c.nom, L / 2, APP.nom.base);

  const chemin = s.app === "sophia" ? "assets/sophia/icone.jpg" : `${s.dossier ?? ""}/icone.jpg`;
  if (s.app !== "sophia" && !s.dossier) throw new Error(`${c.nom} : la slide n'a pas de « dossier » (images/applis/<nom>)`);
  const { x, y, cote, rayon } = APP.icone;
  ctx.save();
  rectArrondi(ctx, x, y, cote, cote, rayon);
  ctx.clip();
  ctx.drawImage(await image(chemin), x, y, cote, cote);
  ctx.restore();
  rectArrondi(ctx, x + 0.75, y + 0.75, cote - 1.5, cote - 1.5, rayon);
  ctx.strokeStyle = COULEUR.filet;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `${APP.texte.taille}px "${POLICE.texte}"`;
  ctx.fillStyle = COULEUR.texte;
  const lignes = couper(ctx, c.texte, APP.texte.largeur);
  if (lignes.length > 6) throw new Error(`${c.nom} : phrase trop longue (${lignes.length} lignes, 5 au plus chez lui)`);
  for (const [i, l] of lignes.entries()) ctx.fillText(l, L / 2, APP.texte.base + i * APP.texte.pas);
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans contenu en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, c as Couverture);
  else if (s.type === "appli") await appli(ctx, s, c as AppliSlide);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
