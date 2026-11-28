// Le rendu des slides du podz 33, au style exact de @scilla2047 (mesuré le
// 27/11 sur ses slides carrées, ramenées à 1080 × 1080) :
// - fond blanc, le texte natif de TikTok (TikTok Sans), tout centré ;
// - la couverture : le titre en noir (Medium, 70 px), sa fin en rouge
//   (`{…}`, « coping mechanism »), puis une image pleine largeur en bas ;
// - un point : un titre noir (Medium, 66 px, lignes tous les 99 px), un
//   paragraphe en couleur assortie à l'image (SemiBold, 40 px, lignes tous
//   les 51,5 px, coupé à 780 px), puis l'œuvre en dessous, jusqu'au bas ;
// - la slide Artura : un point dont l'œuvre porte le LOGO d'Artura à sa
//   droite (son icône, coins arrondis), jamais une capture de l'appli.
// Les œuvres sont de vrais tableaux du domaine public (Met Open Access,
// `npm run oeuvre`), jamais générées. La couleur du paragraphe vient de
// l'œuvre (sa teinte la plus vive, assombrie pour se lire), ou de `couleur`.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1080;

const NOIR = "#0B0B0B";
const ROUGE = "#E5433D";
const COUV = { taille: 70, pas: 90, base: 190, largeur: 900, ecart: 70 } as const;
const TITRE = { taille: 66, pas: 99, base: 182, largeur: 880 } as const;
const TEXTE = { taille: 40, pas: 51.5, largeur: 780, ecart: 87 } as const;
const IMAGE = { ecart: 62, bas: 1052, largeur: 900, hauteurMin: 300 } as const;
const LOGO = { c: 128, ecart: 26 } as const;
const ICONE_ARTURA = "assets/artura/icone.png";

export type TypeSlide = "couverture" | "point" | "artura";
export type Cadrage = { x?: number; y?: number };
export type Slide = {
  type: TypeSlide;
  /** L'œuvre (images/oeuvres/<nom>.jpg, `npm run oeuvre`), sa fiche dans `oeuvres` du post. */
  image: string;
  /** Couverture : la partie de l'œuvre gardée dans la bande du bas (0 à 1, au centre par défaut). */
  cadrage?: Cadrage;
  /** La couleur du paragraphe (#RRGGBB) ; sinon tirée de l'œuvre. */
  couleur?: string;
  [langue: string]: unknown;
};
export type TexteCouverture = { titre: string };
export type TextePoint = { titre: string; texte: string };
export type Source = { musee: string; id: string; titre: string; artiste: string; date: string; url: string };

export type Post = {
  id: string;
  /** Le post du compte modèle qui sert de preuve (format et famille d'accroche qui ont marché). */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  titre: Record<string, string>;
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  /** Les œuvres utilisées : chemin local → fiche du musée. */
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

const sansBalises = (t: string) => t.replace(/[{}]/g, "");
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, string>>(s, langue);
  return sansBalises([c.titre, c.texte].filter(Boolean).join(" — ").replace(/\n/g, " "));
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

/** La teinte la plus vive de l'œuvre, assombrie pour se lire sur le blanc (comme ses paragraphes). */
function couleurDe(img: Image): string {
  const c = createCanvas(64, 64);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  // Un histogramme des teintes (24 cases), pondéré par la saturation.
  const cases = new Array(24).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (s < 0.25 || mx < 0.15) continue;
    let h = 0;
    if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    cases[Math.floor((h / 6) * 24) % 24] += s;
  }
  const k = cases.indexOf(Math.max(...cases));
  const teinte = cases[k] > 0 ? ((k + 0.5) / 24) * 360 : 225;
  return `hsl(${Math.round(teinte)}, 62%, 34%)`;
}

type Mot = { t: string; rouge: boolean };
function mots(t: string): Mot[] {
  const sortie: Mot[] = [];
  let rouge = false;
  for (const brut of t.split(/\s+/).filter(Boolean)) {
    let m = brut;
    let r = rouge;
    if (m.startsWith("{")) (r = true), (rouge = true), (m = m.slice(1));
    if (m.endsWith("}")) (m = m.slice(0, -1)), (rouge = false);
    sortie.push({ t: m, rouge: r });
  }
  return sortie;
}

/** Des lignes centrées (« \n » force une ligne) ; rend la ligne de base de la dernière. */
function centre(ctx: Ctx, t: string, police: string, taille: number, pas: number, largeur: number, y: number, couleur: string): number {
  ctx.font = `${taille}px "${police}"`;
  const espace = ctx.measureText(" ").width;
  const lignes: Mot[][] = [];
  for (const para of t.split("\n")) {
    let cur: Mot[] = [];
    for (const m of mots(para)) {
      const l = ctx.measureText([...cur, m].map((x) => x.t).join(" ")).width;
      if (cur.length && l > largeur) (lignes.push(cur), (cur = [m]));
      else cur.push(m);
    }
    if (cur.length) lignes.push(cur);
  }
  for (const [i, l] of lignes.entries()) {
    const w = l.reduce((s, m) => s + ctx.measureText(m.t).width, 0) + espace * (l.length - 1);
    let x = (L - w) / 2;
    for (const m of l) {
      ctx.fillStyle = m.rouge ? ROUGE : couleur;
      ctx.fillText(m.t, x, y + i * pas);
      x += ctx.measureText(m.t).width + espace;
    }
  }
  return y + (lignes.length - 1) * pas;
}

/** L'œuvre au centre de la boîte (sans la rogner), et sa place. */
function poser(ctx: Ctx, img: Image, haut: number, largeur: number, bas: number): { x: number; y: number; l: number; h: number } {
  const k = Math.min(largeur / img.width, (bas - haut) / img.height);
  const l = img.width * k;
  const h = img.height * k;
  return { x: (L - l) / 2, y: haut + (bas - haut - h) / 2, l, h };
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const n = post.slides.indexOf(s) + 1;
  const ou = `${post.id} slide ${n}`;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  if (!s.image) throw new Error(`${ou} : son œuvre (images/oeuvres/, npm run oeuvre)`);
  const img = await image(s.image);

  if (s.type === "couverture") {
    const c = contenu<TexteCouverture>(s, langue);
    if (!c?.titre) throw new Error(`${ou} : le titre de la couverture en ${langue}`);
    const fin = centre(ctx, c.titre, POLICE.titre, COUV.taille, COUV.pas, COUV.largeur, COUV.base, NOIR);
    // La bande du bas : l'œuvre pleine largeur, recadrée (comme ses couvertures « How your triggers… »).
    const haut = fin + COUV.ecart;
    if (H - haut < 380) throw new Error(`${ou} : le titre descend trop (bande d'image de ${Math.round(H - haut)} px, 380 au moins) : raccourcis`);
    const bh = H - haut;
    const k = Math.max(L / img.width, bh / img.height);
    const lw = L / k, hh = bh / k;
    const b = (v: number | undefined) => Math.min(1, Math.max(0, v ?? 0.5));
    ctx.drawImage(img, (img.width - lw) * b(s.cadrage?.x), (img.height - hh) * b(s.cadrage?.y), lw, hh, 0, haut, L, bh);
  } else if (s.type === "point" || s.type === "artura") {
    const c = contenu<TextePoint>(s, langue);
    if (!c?.titre || !c?.texte) throw new Error(`${ou} : le titre et le texte en ${langue}`);
    const fin = centre(ctx, c.titre, POLICE.titre, TITRE.taille, TITRE.pas, TITRE.largeur, TITRE.base, NOIR);
    const couleur = s.couleur ?? couleurDe(img);
    const finTexte = centre(ctx, c.texte, POLICE.texte, TEXTE.taille, TEXTE.pas, TEXTE.largeur, fin + TEXTE.ecart, couleur);
    const haut = finTexte + IMAGE.ecart;
    if (IMAGE.bas - haut < IMAGE.hauteurMin) throw new Error(`${ou} : le texte descend trop (place pour l'œuvre : ${Math.round(IMAGE.bas - haut)} px, ${IMAGE.hauteurMin} au moins) : raccourcis`);
    if (s.type === "artura") {
      // L'œuvre et le logo d'Artura à sa droite, calé sur son bas, le tout centré.
      const p = poser(ctx, img, haut, IMAGE.largeur - LOGO.c - LOGO.ecart, IMAGE.bas);
      const total = p.l + LOGO.ecart + LOGO.c;
      const x0 = (L - total) / 2;
      ctx.drawImage(img, x0, p.y, p.l, p.h);
      const lx = x0 + p.l + LOGO.ecart;
      const ly = p.y + p.h - LOGO.c;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 3;
      rectArrondi(ctx, lx, ly, LOGO.c, LOGO.c, LOGO.c * 0.2237);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.restore();
      ctx.save();
      rectArrondi(ctx, lx, ly, LOGO.c, LOGO.c, LOGO.c * 0.2237);
      ctx.clip();
      ctx.drawImage(await image(ICONE_ARTURA), lx, ly, LOGO.c, LOGO.c);
      ctx.restore();
    } else {
      const p = poser(ctx, img, haut, IMAGE.largeur, IMAGE.bas);
      ctx.drawImage(img, p.x, p.y, p.l, p.h);
    }
  } else throw new Error(`${ou} : type de slide inconnu : ${s.type}`);

  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
