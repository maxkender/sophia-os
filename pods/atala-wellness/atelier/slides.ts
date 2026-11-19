// Un original (posts/<id>.json) et le rendu de ses slides, au style exact de
// @healthy_with_emma6 (relevé du 19/11 : « 6 habitudes wellness qui font leurs
// effets au bout d'une semaine », ses slides façon notes), en 1080 × 1350 :
// - la couverture : le titre en haut à gauche, une ou deux photos (deux qui se
//   chevauchent, comme chez elle), et la petite note « (backed by science) » ;
// - une slide par habitude, sur son blanc cassé : le titre avec ses mots
//   soulignés, une phrase d'intro, une colonne de texte à gauche et une photo
//   à droite, puis la phrase de chute ;
// - la slide Atala, à la place de sa slide pub (« mange healthy même au
//   resto » et sa carte CleanMenu) : même mise en page, une photo de fille qui
//   court tirée de la banque de l'OS, la carte d'Atala (icône, nom, sous-titre)
//   sous la photo et « the app: ».
// Un mot ou un groupe entre _soulignés_ est souligné, comme chez elle.
// Toutes les mesures sont prises sur ses slides de 1080 px de large (la
// couverture, de 1170 px, est réduite à 1080).

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1350;

/** Couleurs relevées sur ses slides (19/11). */
export const COULEUR = {
  fond: "#fafafa",
  texte: "#1d1d1d",
  /** Le sous-titre de la carte d'appli. */
  gris: "#8a8a8a",
  /** Les filets de la carte d'appli. */
  filet: "#e3e3e3",
} as const;

const ICONE_ATALA = "assets/atala/icone.png";

export type TypeSlide = "couverture" | "habitude" | "atala";
/**
 * Une slide. Les photos sont au niveau de la slide (les mêmes dans toutes les
 * langues), les textes sous la clé de chaque langue :
 * - couverture : `photos` (1 ou 2) ; texte `{ "titre": "6 wellness habits…", "note": "(backed by science)" }` ;
 * - habitude : `photo` ; texte `{ "titre", "intro", "paragraphes": [2], "chute" }` ;
 * - atala : `photo` (une fille qui court) ; texte `{ "titre", "intro", "paragraphes": [2],
 *   "appli": "Atala : AI Running Coach", "sous": "…", "legende": "the app:" }`.
 */
/**
 * `cadrage` (facultatif) : où recadrer la photo quand elle n'a pas les
 * proportions du cadre, de 0 (bord gauche / haut) à 1 (bord droit / bas) ;
 * 0,5 par défaut (le centre). Ex. `{ "y": 0.8 }` pour une coureuse en bas
 * d'une photo en hauteur. Une valeur par photo de la slide (couverture : dans
 * l'ordre de `photos`), ou une seule pour toutes.
 */
export type Cadrage = { x?: number; y?: number };
export type Slide = { type: TypeSlide; photo?: string; photos?: string[]; cadrage?: Cadrage | Cadrage[]; [langue: string]: unknown };
const cadrageDe = (s: Slide, i = 0): Cadrage => (Array.isArray(s.cadrage) ? (s.cadrage[i] ?? {}) : (s.cadrage ?? {}));
export type TexteCouverture = { titre: string; note: string };
export type TexteHabitude = { titre: string; intro: string; paragraphes: string[]; chute: string };
export type TexteAtala = { titre: string; intro: string; paragraphes: string[]; appli: string; sous: string; legende: string };

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
/** La slide de l'appli, que l'OS marque `position_app`. */
export const estSlideAtala = (s: Slide) => s.type === "atala";
export const photosSlide = (s: Slide): string[] => [...(s.photos ?? []), ...(s.photo ? [s.photo] : [])];

const sansMarques = (t: string) => t.replace(/_/g, "");
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return sansMarques(`${(c as TexteCouverture).titre} ${(c as TexteCouverture).note}`).replace(/\n/g, " ");
  const t = c as TexteHabitude & Partial<TexteAtala>;
  return sansMarques([t.titre, t.intro, ...(t.paragraphes ?? []), t.chute ?? "", t.appli ?? "", t.sous ?? ""].filter(Boolean).join(" — "));
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

/** La boîte remplie par l'image (recadrée au centre). */
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

// --- Le texte : mots soulignés, coupure, dessin --------------------------------

type Segment = { t: string; souligne: boolean };
/** Un mot (entre deux espaces), en morceaux soulignés ou non : « start_, » → [start (souligné), « , »]. */
type Mot = Segment[];
/** « drink water _before coffee_ » → mots, chacun en morceaux soulignés ou non. */
function mots(t: string): Mot[] {
  const sortie: Mot[] = [];
  let souligne = false;
  let courant: Mot = [];
  for (const c of t) {
    if (c === "_") {
      souligne = !souligne;
      continue;
    }
    if (/\s/.test(c)) {
      if (courant.length) sortie.push(courant);
      courant = [];
      continue;
    }
    const d = courant[courant.length - 1];
    if (d && d.souligne === souligne) d.t += c;
    else courant.push({ t: c, souligne });
  }
  if (courant.length) sortie.push(courant);
  return sortie;
}
const texteMot = (m: Mot) => m.map((s) => s.t).join("");

function couper(ctx: Ctx, t: string, largeur: number): Mot[][] {
  const lignes: Mot[][] = [];
  for (const para of t.split("\n")) {
    let ligne: Mot[] = [];
    for (const m of mots(para)) {
      const essai = [...ligne, m];
      if (ligne.length && ctx.measureText(essai.map(texteMot).join(" ")).width > largeur) {
        lignes.push(ligne);
        ligne = [m];
      } else ligne = essai;
    }
    if (ligne.length) lignes.push(ligne);
  }
  return lignes;
}

/**
 * Ses soulignés : 4,5 px sous la ligne de base, 2,5 px d'épaisseur (en 52 px ;
 * proportionnel), continus d'un mot souligné au suivant, et la ponctuation
 * collée au mot (« start, ») n'est pas soulignée.
 */
function ligne(ctx: Ctx, l: Mot[], x: number, base: number, taille: number) {
  const espace = ctx.measureText(" ").width;
  let cx = x;
  for (const [i, m] of l.entries()) {
    for (const [j, s] of m.entries()) {
      const w = ctx.measureText(s.t).width;
      ctx.fillText(s.t, cx, base);
      if (s.souligne) {
        const suite = j === m.length - 1 && l[i + 1]?.[0]?.souligne;
        ctx.fillRect(cx, base + taille * 0.087, w + (suite ? espace : 0), Math.max(1.6, taille * 0.048));
      }
      cx += w;
    }
    cx += espace;
  }
}

/** Un bloc de texte à gauche, coupé à `largeur` ; rend la base de sa dernière ligne. */
function bloc(ctx: Ctx, t: string, x: number, base: number, largeur: number, taille: number, pas: number, police: string = POLICE.texte): number {
  ctx.font = `${taille}px "${police}"`;
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "left";
  const lignes = couper(ctx, t, largeur);
  for (const [i, l] of lignes.entries()) ligne(ctx, l, x, base + i * pas, taille);
  return base + (lignes.length - 1) * pas;
}
/** La hauteur d'un bloc, sans le dessiner. */
function nbLignes(ctx: Ctx, t: string, largeur: number, taille: number): number {
  ctx.font = `${taille}px "${POLICE.texte}"`;
  return couper(ctx, t, largeur).length;
}

// --- Les mesures (slides de 1080 px) ----------------------------------------------

/**
 * Habitude (sa slide « dors vraiment 8h ») : titre 52 à x 44 ; intro 34 (pas
 * 43, 1 000 px) 82 sous le titre ; photo 434 × 543 à x 462, 30 sous l'intro ;
 * colonne de 405 px à x 35, première ligne 92 sous le haut de la photo,
 * 71 de plus entre deux paragraphes ; chute 70 sous la photo.
 * Atala (sa slide « mange healthy même au resto ») : photo 465 × 533 à x 525,
 * 68 sous l'intro ; colonne de 455 px à x 37, première ligne 44 sous le haut
 * de la photo, 85 de plus entre deux paragraphes ; la carte d'appli sous la
 * photo (icône de 117 à x 508), « the app: » centré dessous.
 */
const M = {
  titre: { taille: 52, x: 44 },
  intro: { taille: 34, pas: 43, x: 41, largeur: 1000, ecart: 82 },
  texte: { taille: 34, pas: 43 },
  habitude: { photo: { x: 462, l: 434, h: 543, ecart: 30 }, col: { x: 35, l: 405, premiere: 92, para: 71 }, chute: { x: 32, ecart: 70, largeur: 1010 } },
  atala: {
    photo: { x: 525, l: 465, h: 533, ecart: 68 },
    col: { x: 37, l: 455, premiere: 44, para: 85 },
    carte: { x: 508, ecart: 18, icone: 117, nom: 30, sous: 24, texteX: 646, filetX0: 610, filetX1: 990 },
    legende: { taille: 34, cx: 586, ecart: 87 },
  },
} as const;

/** Rend le haut du contenu pour que le bloc entier soit centré dans la slide (comme chez elle). */
function departCentre(hauteur: number): number {
  return Math.round((H - hauteur) / 2) + 8;
}

async function habitude(ctx: Ctx, s: Slide, c: TexteHabitude) {
  if (!s.photo) throw new Error(`« ${c.titre} » : pas de photo`);
  if (c.paragraphes.length < 1 || c.paragraphes.length > 3) throw new Error(`« ${c.titre} » : 1 à 3 paragraphes`);
  const m = M.habitude;
  // Hauteur du bloc : titre (cap 38) → intro → photo → chute.
  const nIntro = nbLignes(ctx, c.intro, M.intro.largeur, M.intro.taille);
  const nCol = c.paragraphes.reduce((n, p) => n + nbLignes(ctx, p, m.col.l, M.texte.taille), 0);
  const hautCol = m.col.premiere + (nCol - 1) * M.texte.pas + (c.paragraphes.length - 1) * m.col.para;
  if (hautCol > m.photo.h + 20) throw new Error(`« ${c.titre} » : la colonne de texte dépasse la photo, raccourcis les paragraphes`);
  const hauteur = 38 + M.intro.ecart + (nIntro - 1) * M.intro.pas + m.photo.ecart + m.photo.h + m.chute.ecart + 10;
  const baseTitre = departCentre(hauteur) + 38;
  bloc(ctx, c.titre, M.titre.x, baseTitre, 1000, M.titre.taille, 62);
  const finIntro = bloc(ctx, c.intro, M.intro.x, baseTitre + M.intro.ecart, M.intro.largeur, M.intro.taille, M.intro.pas);
  const hautPhoto = finIntro + m.photo.ecart;
  remplir(ctx, await image(s.photo), m.photo.x, hautPhoto, m.photo.l, m.photo.h, cadrageDe(s));
  let base = hautPhoto + m.col.premiere;
  for (const p of c.paragraphes) base = bloc(ctx, p, m.col.x, base, m.col.l, M.texte.taille, M.texte.pas) + M.texte.pas + m.col.para;
  bloc(ctx, c.chute, m.chute.x, hautPhoto + m.photo.h + m.chute.ecart, m.chute.largeur, M.texte.taille, M.texte.pas);
}

async function atala(ctx: Ctx, s: Slide, c: TexteAtala) {
  if (!s.photo) throw new Error("slide Atala : pas de photo (une fille qui court, de la banque)");
  const m = M.atala;
  const nIntro = nbLignes(ctx, c.intro, M.intro.largeur, M.intro.taille);
  const nCol = c.paragraphes.reduce((n, p) => n + nbLignes(ctx, p, m.col.l, M.texte.taille), 0);
  const hautCol = m.col.premiere + (nCol - 1) * M.texte.pas + (c.paragraphes.length - 1) * m.col.para;
  if (hautCol > m.photo.h + m.carte.icone + 40) throw new Error("slide Atala : la colonne de texte est trop longue");
  const hauteur = 38 + M.intro.ecart + (nIntro - 1) * M.intro.pas + m.photo.ecart + m.photo.h + m.carte.ecart + m.carte.icone + m.legende.ecart + 10;
  const baseTitre = departCentre(hauteur) + 38;
  bloc(ctx, c.titre, M.titre.x, baseTitre, 1000, M.titre.taille, 62);
  const finIntro = bloc(ctx, c.intro, M.intro.x, baseTitre + M.intro.ecart, M.intro.largeur, M.intro.taille, M.intro.pas);
  const hautPhoto = finIntro + m.photo.ecart;
  remplir(ctx, await image(s.photo), m.photo.x, hautPhoto, m.photo.l, m.photo.h, cadrageDe(s));
  let base = hautPhoto + m.col.premiere;
  for (const p of c.paragraphes) base = bloc(ctx, p, m.col.x, base, m.col.l, M.texte.taille, M.texte.pas) + M.texte.pas + m.col.para;

  // La carte d'appli, comme sa capture de l'App Store : filet, icône, nom, sous-titre, filet.
  const k = m.carte;
  const basPhoto = hautPhoto + m.photo.h;
  const yIcone = basPhoto + k.ecart;
  ctx.fillStyle = COULEUR.filet;
  ctx.fillRect(k.filetX0, basPhoto + 2, k.filetX1 - k.filetX0, 1.5);
  ctx.save();
  rectArrondi(ctx, k.x, yIcone, k.icone, k.icone, k.icone * 0.2237);
  ctx.clip();
  ctx.drawImage(await image(ICONE_ATALA), k.x, yIcone, k.icone, k.icone);
  ctx.restore();
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "left";
  ctx.font = `${k.nom}px "${POLICE.gras}"`;
  ctx.fillText(c.appli, k.texteX, yIcone + 50);
  ctx.fillStyle = COULEUR.gris;
  ctx.font = `${k.sous}px "${POLICE.texte}"`;
  ctx.fillText(c.sous, k.texteX, yIcone + 91);
  ctx.fillStyle = COULEUR.filet;
  ctx.fillRect(k.filetX0, yIcone + k.icone + 4, k.filetX1 - k.filetX0, 1.5);
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "center";
  ctx.font = `${m.legende.taille}px "${POLICE.gras}"`;
  ctx.fillText(c.legende, m.legende.cx, yIcone + k.icone + m.legende.ecart);
}

// --- La couverture (sa slide de 1170 px, réduite à 1080) ----------------------------

/**
 * Ses mesures (1170 × 1426) : titre de 60 à x 102, lignes tous les 78 ;
 * deux photos qui se chevauchent : A (en haut à droite) 584 × 372 à x 471,
 * juste sous le titre ; B (en bas à gauche, par-dessus) 561 × 419 à x 37,
 * 194 plus bas ; la note de 38 centrée sur x 716, 73 sous la photo B.
 * Une seule photo : 560 × 720, centrée.
 */
const COUV = { k: L / 1170, titre: { taille: 60, x: 102, pas: 78, largeur: 900 }, a: { x: 471, l: 584, h: 372, ecart: 7 }, b: { x: 37, l: 561, h: 419, decalage: 194 }, seule: { l: 560, h: 720, ecart: 40 }, note: { taille: 38, cx: 716, ecart: 73 } };

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  const photos = s.photos ?? [];
  if (photos.length < 1 || photos.length > 2) throw new Error("couverture : une ou deux photos");
  const K = COUV.k;
  ctx.save();
  ctx.scale(K, K);
  const HH = H / K;
  ctx.font = `${COUV.titre.taille}px "${POLICE.texte}"`;
  const nTitre = nbLignes(ctx, c.titre, COUV.titre.largeur, COUV.titre.taille);
  const hPhotos = photos.length === 2 ? COUV.a.ecart + COUV.b.decalage + COUV.b.h : COUV.seule.ecart + COUV.seule.h;
  const hauteur = 37 + (nTitre - 1) * COUV.titre.pas + hPhotos + COUV.note.ecart + 10;
  const baseTitre = Math.round((HH - hauteur) / 2) - 20 + 37;
  const fin = bloc(ctx, c.titre, COUV.titre.x, baseTitre, COUV.titre.largeur, COUV.titre.taille, COUV.titre.pas);
  let basPhotos: number;
  if (photos.length === 2) {
    const yA = fin + COUV.a.ecart + 7;
    remplir(ctx, await image(photos[0]), COUV.a.x, yA, COUV.a.l, COUV.a.h, cadrageDe(s, 0));
    const yB = yA + COUV.b.decalage;
    remplir(ctx, await image(photos[1]), COUV.b.x, yB, COUV.b.l, COUV.b.h, cadrageDe(s, 1));
    basPhotos = yB + COUV.b.h;
  } else {
    const y = fin + COUV.seule.ecart;
    remplir(ctx, await image(photos[0]), 1170 / 2 - COUV.seule.l / 2, y, COUV.seule.l, COUV.seule.h, cadrageDe(s, 0));
    basPhotos = y + COUV.seule.h;
  }
  ctx.font = `${COUV.note.taille}px "${POLICE.texte}"`;
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "center";
  ctx.fillText(c.note, photos.length === 2 ? COUV.note.cx : 1170 / 2, basPhotos + COUV.note.ecart);
  ctx.restore();
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = COULEUR.fond;
  ctx.fillRect(0, 0, L, H);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture);
  else if (s.type === "habitude") await habitude(ctx, s, c as TexteHabitude);
  else if (s.type === "atala") await atala(ctx, s, c as TexteAtala);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
