// Le rendu des slides du podz 26, au style exact de @traceygreen589 (mesuré
// sur ses slides de 1080 × 1440, relevé du 24/11), tout en Arial (Arimo) :
// - la couverture : « 10/10 hobbies that actually / work if you have adhd »
//   (65 px, à gauche), une grande image de cerveau (IRM) et « (neuroscience
//   backed) » en petit dessous ;
// - un loisir : son nom (56 px), une accroche (41 px) aux mots soulignés, une
//   photo de 465 px à gauche, une colonne de texte à droite, une chute
//   sous la photo ;
// - les slides d'appli (une Atala, une Artura dans chaque post) : un loisir
//   comme les autres dont la photo porte le LOGO de l'appli dans son coin, et
//   le « pro tip: … » de la colonne cite l'appli (chez elle : Brainmaxx).
// Mots soulignés : entre `_` (« your _phone can't come_ ») ; chaque mot est
// souligné à part, comme chez elle.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1440;
const ENCRE = "#000000";

/** Les applis du podz : leur slide et leur logo (icône de l'App Store, 1024 px). */
export const APPLIS = {
  atala: { logo: "assets/atala/icone.png" },
  artura: { logo: "assets/artura/icone.png" },
} as const;
export type SlugAppli = keyof typeof APPLIS;

export type TypeSlide = "couverture" | "loisir" | SlugAppli;
export type Cadrage = { x?: number; y?: number };
export type Slide = {
  type: TypeSlide;
  /** La photo du loisir (images/banque/… ou images/photos/…), l'image de couverture. */
  photo?: string;
  /** `paysage` (4:3, le sien, par défaut), `carre`, `portrait` (3:4). */
  format?: "paysage" | "carre" | "portrait";
  cadrage?: Cadrage;
  [langue: string]: unknown;
};

export type TexteCouverture = { titre: string; note?: string };
/** `accroche`, `colonne` et `chute` acceptent des mots soulignés entre `_`. */
export type TexteLoisir = { nom: string; accroche: string; colonne: string[]; chute?: string };

export type Post = {
  id: string;
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
/** L'appli d'une slide (`atala`, `artura`), ou null pour un loisir et la couverture. */
export const appliDeSlide = (s: Slide): SlugAppli | null => (s.type in APPLIS ? (s.type as SlugAppli) : null);
export const photosSlide = (s: Slide): string[] => (s.photo ? [s.photo] : []);

const sansMarques = (t: string) => t.replace(/_/g, "");
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return sansMarques(`${(c as TexteCouverture).titre.replace(/\n/g, " ")} ${(c as TexteCouverture).note ?? ""}`).trim();
  const t = c as TexteLoisir;
  return sansMarques([t.nom, t.accroche, ...t.colonne, t.chute ?? ""].filter(Boolean).join(" — "));
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

// --- Le texte : mots soulignés entre `_` -------------------------------------------

/** Un mot : ses morceaux (un mot peut être à moitié souligné : « _tip_: »). */
type Mot = { t: string; morceaux: { t: string; souligne: boolean }[] };
function mots(t: string): Mot[] {
  const out: Mot[] = [];
  let souligne = false;
  let cur: Mot = { t: "", morceaux: [] };
  const fin = () => {
    if (cur.t) out.push(cur);
    cur = { t: "", morceaux: [] };
  };
  for (const ch of t) {
    if (ch === "_") souligne = !souligne;
    else if (/\s/.test(ch)) fin();
    else {
      const dernier = cur.morceaux[cur.morceaux.length - 1];
      if (dernier && dernier.souligne === souligne) dernier.t += ch;
      else cur.morceaux.push({ t: ch, souligne });
      cur.t += ch;
    }
  }
  fin();
  return out;
}
function couper(ctx: Ctx, t: string, largeur: number): Mot[][] {
  const lignes: Mot[][] = [];
  let cur: Mot[] = [];
  const largeurDe = (l: Mot[]) => ctx.measureText(l.map((m) => m.t).join(" ")).width;
  for (const m of mots(t)) {
    if (cur.length && largeurDe([...cur, m]) > largeur) {
      lignes.push(cur);
      cur = [m];
    } else cur.push(m);
  }
  if (cur.length) lignes.push(cur);
  return lignes;
}
/** Une ligne à gauche ; chaque morceau souligné à part (un trait de 3 px, sous la ligne de base). */
function ligne(ctx: Ctx, l: Mot[], x: number, base: number, taille: number) {
  const espace = ctx.measureText(" ").width;
  let cx = x;
  for (const m of l) {
    for (const p of m.morceaux) {
      const w = ctx.measureText(p.t).width;
      ctx.fillText(p.t, cx, base);
      if (p.souligne) ctx.fillRect(cx, base + Math.round(taille * 0.29), w, 3);
      cx += w;
    }
    cx += espace;
  }
}
/** Un bloc de texte ; rend la ligne de base de sa dernière ligne. */
function bloc(ctx: Ctx, t: string, x: number, base: number, largeur: number, taille: number, pas: number): number {
  ctx.font = `${taille}px "${POLICE.texte}"`;
  const ls = couper(ctx, t, largeur);
  for (const [i, l] of ls.entries()) ligne(ctx, l, x, base + i * pas, taille);
  return base + (ls.length - 1) * pas;
}

// --- Un loisir et les slides d'appli -----------------------------------------------

/** Ses mesures (« swimming », « playing an instrument ») : le nom 56 px à (62, 273) ;
 * l'accroche 41 px à y = 464, lignes tous les 49 px, sur 930 px ; la photo 465 px de
 * large à x = 62, 47 px sous l'accroche ; la colonne à x = 567 (440 px), sa première
 * ligne 49 px sous le haut de la photo, une ligne vide entre deux paragraphes ; la
 * chute 93 px sous la photo (ou la colonne), à x = 62. */
const LOISIR = {
  nom: { taille: 56, x: 62, base: 273 },
  accroche: { taille: 41, x: 62, base: 464, pas: 49, largeur: 930 },
  photo: { x: 62, l: 465, ecart: 47 },
  colonne: { x: 567, largeur: 440, taille: 41, pas: 49, ecart: 49 },
  chute: { x: 62, ecart: 93, largeur: 940, taille: 41, pas: 49 },
  fin: 1330,
  logo: { cote: 150, marge: 18 },
} as const;
const RATIOS = { paysage: 4 / 3, carre: 1, portrait: 3 / 4 } as const;

async function loisir(ctx: Ctx, s: Slide, c: TexteLoisir) {
  if (!s.photo) throw new Error(`« ${c.nom} » : pas de photo`);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "left";
  ctx.font = `${LOISIR.nom.taille}px "${POLICE.texte}"`;
  if (ctx.measureText(c.nom).width > 950) throw new Error(`« ${c.nom} » : nom trop long`);
  ctx.fillText(c.nom, LOISIR.nom.x, LOISIR.nom.base);
  const finAccroche = bloc(ctx, c.accroche, LOISIR.accroche.x, LOISIR.accroche.base, LOISIR.accroche.largeur, LOISIR.accroche.taille, LOISIR.accroche.pas);

  // La photo, et le logo de l'appli dans son coin bas droit sur une slide d'appli.
  const yPhoto = finAccroche + LOISIR.photo.ecart;
  const hPhoto = LOISIR.photo.l / RATIOS[s.format ?? "paysage"];
  remplir(ctx, await image(s.photo), LOISIR.photo.x, yPhoto, LOISIR.photo.l, hPhoto, s.cadrage);
  const appli = appliDeSlide(s);
  if (appli) {
    const { cote, marge } = LOISIR.logo;
    const xl = LOISIR.photo.x + LOISIR.photo.l - cote - marge;
    const yl = yPhoto + hPhoto - cote - marge;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    rectArrondi(ctx, xl, yl, cote, cote, cote * 0.2237);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    rectArrondi(ctx, xl, yl, cote, cote, cote * 0.2237);
    ctx.clip();
    ctx.drawImage(await image(APPLIS[appli].logo), xl, yl, cote, cote);
    ctx.restore();
    ctx.fillStyle = ENCRE;
  }

  // La colonne de droite, paragraphes séparés d'une ligne vide.
  let y: number = yPhoto + LOISIR.colonne.ecart;
  for (const [k, p] of c.colonne.entries()) {
    y = bloc(ctx, p, LOISIR.colonne.x, y, LOISIR.colonne.largeur, LOISIR.colonne.taille, LOISIR.colonne.pas);
    if (k < c.colonne.length - 1) y += 2 * LOISIR.colonne.pas;
  }
  // La chute, sous la photo ou sous la colonne si elle descend plus bas.
  let fin = Math.max(yPhoto + hPhoto, y);
  if (c.chute) fin = bloc(ctx, c.chute, LOISIR.chute.x, Math.max(yPhoto + hPhoto + LOISIR.chute.ecart, y + 2 * LOISIR.chute.pas), LOISIR.chute.largeur, LOISIR.chute.taille, LOISIR.chute.pas);
  if (fin > LOISIR.fin) throw new Error(`« ${c.nom} » : trop long (le texte finit à y = ${Math.round(fin)}) : raccourcis`);
}

// --- La couverture -----------------------------------------------------------------

/** Ses mesures : le titre 65 px à x = 62, lignes à y = 298 puis tous les 78 px ; l'image
 * 960 × 724 à (60, 520) ; « (neuroscience backed) » 22 px centré à y = 1280. */
const COUV = {
  titre: { taille: 65, x: 62, base: 298, pas: 78 },
  image: { x: 60, y: 520, l: 960, h: 724 },
  note: { taille: 22, base: 1280 },
} as const;

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "left";
  ctx.font = `${COUV.titre.taille}px "${POLICE.texte}"`;
  const lignes = c.titre.split("\n");
  if (lignes.length > 3) throw new Error("couverture : trois lignes au plus");
  for (const [i, l] of lignes.entries()) {
    if (ctx.measureText(l).width > 960) throw new Error(`couverture : « ${l} » trop long`);
    ctx.fillText(l, COUV.titre.x, COUV.titre.base + i * COUV.titre.pas);
  }
  if (!s.photo) throw new Error("couverture : pas d'image (le cerveau)");
  const { x, y, l, h } = COUV.image;
  remplir(ctx, await image(s.photo), x, y + (lignes.length - 2) * COUV.titre.pas, l, h, s.cadrage);
  if (c.note) {
    ctx.textAlign = "center";
    ctx.font = `${COUV.note.taille}px "${POLICE.texte}"`;
    ctx.fillText(c.note, L / 2, COUV.note.base + (lignes.length - 2) * COUV.titre.pas);
  }
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture);
  else if (s.type === "loisir" || appliDeSlide(s)) await loisir(ctx, s, c as TexteLoisir);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
