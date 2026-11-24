// Un original (posts/<id>.json) et le rendu de ses slides, au style exact de
// @hannah.run5 et @katrina.run (relevé du 19/11 : le même gabarit Canva chez
// les deux, des comptes UGC de l'appli Pacewell). Toutes les mesures sont
// prises sur leurs slides de 1820 × 2220 ; le rendu se fait en 1080 × 1317
// (même rapport), en réduisant tout d'un facteur K.
// - la couverture : le titre en Playfair Display sur deux lignes (un mot
//   appuyé en italique gras possible), trois chevrons, et une coureuse
//   détourée en bas, plein pied ;
// - « do & don'ts » : le titre du moment (« la tenue », « race morning »),
//   « Do ✓ » et trois vignettes légendées, « Don’t ✕ » et deux vignettes.
//   Deux styles, comme chez elles : `objets` (objets détourés sur blanc, chez
//   hannah) ou `photos` (photos carrées, chez katrina) ;
// - la grille (« à éviter », « à manger ») : un titre et 3 × 3 vignettes.
// Chez elles, le post finit sur une page de l'appli. Chez nous, jamais : le
// logo d'Atala est UNE vignette parmi les « Do » (ou dans une grille « bonne »),
// avec sa légende, comme un objet de plus.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { FAMILLE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
/** Taille des slides de référence (leurs captures) et taille rendue. */
const REF = { l: 1820, h: 2220 };
export const L = 1080;
export const H = Math.round((L * REF.h) / REF.l);
const K = L / REF.l;

export const COULEUR = { fond: "#ffffff", texte: "#000000" } as const;
/** L'image qui veut dire « le logo d'Atala » dans une liste de vignettes. */
export const ATALA = "atala";
const ICONE_ATALA = "assets/atala/icone.png";

export type Style = "objets" | "photos";
export type TypeSlide = "couverture" | "dodont" | "grille";
/**
 * Une slide. Les images sont au niveau de la slide (les mêmes dans toutes les
 * langues), les textes sous la clé de chaque langue.
 * - couverture : `image` (la coureuse détourée, PNG), `autour` facultatif ;
 *   texte `{ "titre": "first 5k\ndo and don’ts" }` (`*mot*` = appuyé) ;
 * - dodont : `do` (3 images) et `dont` (2 images), `"atala"` pour le logo ;
 *   texte `{ "titre": "race morning", "do": [3 légendes], "dont": [2 légendes] }` ;
 * - grille : `images` (6 ou 9), `bon: true` si c'est la liste « à faire » ;
 *   texte `{ "titre": "*à manger*", "legendes": [...] }`.
 */
export type Slide = {
  type: TypeSlide;
  style?: Style;
  image?: string;
  autour?: { image: string; x: number; y: number; hauteur: number }[];
  do?: string[];
  dont?: string[];
  images?: string[];
  bon?: boolean;
  [langue: string]: unknown;
};
export type TexteCouverture = { titre: string };
export type TexteDodont = { titre: string; do: string[]; dont: string[] };
export type TexteGrille = { titre: string; legendes: string[] };

export type Post = {
  id: string;
  /** Style par défaut des slides « do & don'ts » (`objets` ou `photos`). */
  style: Style;
  /** Le post d'un compte modèle qui sert de preuve (format et accroche qui ont marché). */
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
/** Les images d'une slide, dans l'ordre. */
export const imagesSlide = (s: Slide): string[] => [s.image ?? "", ...(s.do ?? []), ...(s.dont ?? []), ...(s.images ?? [])].filter(Boolean);
/** La slide de l'appli, que l'OS marque `position_app` : celle qui porte le logo d'Atala. */
export const estSlideAtala = (s: Slide) => imagesSlide(s).includes(ATALA);

export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  const titre = String(c.titre ?? "").replace(/\*/g, "").replace(/\n/g, " ");
  if (s.type === "couverture") return titre;
  if (s.type === "dodont") {
    const t = c as TexteDodont;
    return `${titre} — do: ${t.do.join(" · ")} — don't: ${t.dont.join(" · ")}`;
  }
  return `${titre} — ${(c as TexteGrille).legendes.join(" · ")}`;
}

// ---------------------------------------------------------------------------

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

const cache = new Map<string, Image>();
async function image(chemin: string): Promise<Image> {
  const f = join(RACINE, chemin === ATALA ? ICONE_ATALA : chemin);
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

/** L'image entière dans la boîte (centrée), jamais déformée. */
function contenir(ctx: Ctx, img: Image, cx: number, cy: number, l: number, h: number) {
  const k = Math.min(l / img.width, h / img.height);
  ctx.drawImage(img, cx - (img.width * k) / 2, cy - (img.height * k) / 2, img.width * k, img.height * k);
}
/** La boîte remplie par l'image (recadrée au centre). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number) {
  const k = Math.max(l / img.width, h / img.height);
  const lw = l / k;
  const hh = h / k;
  ctx.drawImage(img, (img.width - lw) / 2, (img.height - hh) / 2, lw, hh, x, y, l, h);
}

/** Le logo d'Atala : l'icône de l'appli, coins arrondis comme sur un téléphone. */
async function logoAtala(ctx: Ctx, cx: number, cy: number, cote: number) {
  ctx.save();
  rectArrondi(ctx, cx - cote / 2, cy - cote / 2, cote, cote, cote * 0.2237);
  ctx.clip();
  ctx.drawImage(await image(ATALA), cx - cote / 2, cy - cote / 2, cote, cote);
  ctx.restore();
}

/** Coupe une légende en lignes de `max` caractères au plus (police à chasse fixe) ; « \n » force une ligne. */
function couperLegende(t: string, max: number): string[] {
  const lignes: string[] = [];
  for (const para of t.split("\n")) {
    let ligne = "";
    for (const mot of para.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (ligne && [...essai].length > max) {
        lignes.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    if (ligne) lignes.push(ligne);
  }
  return lignes;
}

/** Ses légendes : Red Hat Mono SemiBold 48,5, centrées, 65 entre les lignes. Une légende grecque passe tout entière en Fira Mono (une seule graisse sur la ligne, « coach » et « atala » compris). */
const LEG = { taille: 48.5, pas: 65 };
const GREC = /[\u0370-\u03ff\u1f00-\u1fff]/;
function legende(ctx: Ctx, t: string, cx: number, base: number, max: number) {
  ctx.font = `${LEG.taille}px ${GREC.test(t) ? FAMILLE.legendeGrec : FAMILLE.legende}`;
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "center";
  const lignes = couperLegende(t, max);
  if (lignes.length > 3) throw new Error(`légende trop longue : « ${t} » (3 lignes au plus)`);
  for (const [i, l] of lignes.entries()) ctx.fillText(l, cx, base + i * LEG.pas);
}

/**
 * Un titre en Playfair Display, centré ; `*mot*` passe en italique gras
 * (« how to be the 6am *running girl* »). Les morceaux d'une ligne sont posés
 * l'un après l'autre, puis la ligne est centrée.
 */
function titre(ctx: Ctx, t: string, cx: number, base: number, taille: number, pas: number, largeurMax = 1500) {
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "left";
  for (const [i, ligne] of t.split("\n").entries()) {
    const morceaux = ligne.split(/(\*[^*]+\*)/).filter(Boolean).map((m) => (m.startsWith("*") ? { t: m.slice(1, -1), appui: true } : { t: m, appui: false }));
    let s = taille;
    const largeur = (k: number) =>
      morceaux.reduce((w, m) => {
        ctx.font = `${k}px ${m.appui ? FAMILLE.appui : FAMILLE.titre}`;
        return w + ctx.measureText(m.t).width;
      }, 0);
    while (s > 60 && largeur(s) > largeurMax) s -= 4;
    let x = cx - largeur(s) / 2;
    for (const m of morceaux) {
      ctx.font = `${s}px ${m.appui ? FAMILLE.appui : FAMILLE.titre}`;
      ctx.fillText(m.t, x, base + i * pas);
      x += ctx.measureText(m.t).width;
    }
  }
}

/** « Do ✓ » ou « Don’t ✕ » : Red Hat Mono SemiBold de 97 (capitale de 68), le signe dessiné au trait. */
function entete(ctx: Ctx, mot: "Do" | "Don’t", base: number) {
  const taille = 97;
  const cap = 68;
  ctx.font = `${taille}px ${FAMILLE.legende}`;
  const w = ctx.measureText(mot).width;
  const signe = mot === "Do" ? 66 : 60;
  const ecart = 20;
  const x0 = REF.l / 2 - (w + ecart + signe) / 2;
  ctx.fillStyle = COULEUR.texte;
  ctx.textAlign = "left";
  ctx.fillText(mot, x0, base);
  const x = x0 + w + ecart;
  ctx.strokeStyle = COULEUR.texte;
  ctx.lineWidth = mot === "Do" ? 9.5 : 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (mot === "Do") {
    ctx.moveTo(x, base - cap * 0.42);
    ctx.lineTo(x + signe * 0.34, base - 2);
    ctx.lineTo(x + signe, base - cap * 0.98);
  } else {
    const h = signe;
    ctx.moveTo(x, base - h);
    ctx.lineTo(x + signe, base);
    ctx.moveTo(x + signe, base - h);
    ctx.lineTo(x, base);
  }
  ctx.stroke();
}

// --- La couverture ----------------------------------------------------------

/** Ses mesures : titre de 184 en deux lignes (bases 437 et 623), chevrons à 744-782, la coureuse de 905 au bas de la slide. */
const COUV = { taille: 184, base: 437, pas: 186, chevrons: { y: 744, h: 39, l: 139 }, image: { haut: 905, largeur: 1150 } };

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture) {
  titre(ctx, c.titre, REF.l / 2, COUV.base, COUV.taille, COUV.pas, 1560);
  // >>> : trois chevrons fins, comme les leurs.
  const { y, h, l } = COUV.chevrons;
  ctx.strokeStyle = COULEUR.texte;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const pas = l / 3;
  for (let i = 0; i < 3; i++) {
    const x = REF.l / 2 - l / 2 + i * pas + 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + pas * 0.62, y + h / 2);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }
  for (const a of s.autour ?? []) {
    const img = await image(a.image);
    const lw = (img.width * a.hauteur) / img.height;
    ctx.drawImage(img, a.x - lw / 2, a.y - a.hauteur / 2, lw, a.hauteur);
  }
  if (!s.image) throw new Error("couverture sans `image` (la coureuse détourée)");
  const img = await image(s.image);
  const hMax = REF.h - COUV.image.haut;
  const k = Math.min(hMax / img.height, COUV.image.largeur / img.width);
  const lw = img.width * k;
  const hh = img.height * k;
  ctx.drawImage(img, REF.l / 2 - lw / 2, REF.h - hh, lw, hh);
}

// --- « do & don'ts » ----------------------------------------------------------

/**
 * Leurs deux variantes, mesurées :
 * - objets (hannah) : boîtes de 470 × 366, Do à 632 (centres 382, 910, 1438),
 *   Don't à 1548 (centres 623 et 1198), légendes 79 sous la boîte, 14 signes par ligne ;
 * - photos (katrina) : carrés de 530, Do à 552 (centres 340, 910, 1480),
 *   Don't à 1456 (centres 537 et 1281), légendes 76 sous la photo, 16 signes.
 */
const DODONT = {
  objets: { titre: 296, do: 491, dont: 1397, boite: { l: 470, h: 366 }, hautDo: 632, hautDont: 1548, xDo: [382, 910, 1438], xDont: [623, 1198], leg: 79, max: 14, atala: 330 },
  photos: { titre: 296, do: 489, dont: 1375, boite: { l: 530, h: 530 }, hautDo: 552, hautDont: 1456, xDo: [340, 910, 1480], xDont: [537, 1281], leg: 76, max: 16, atala: 530 },
} as const;

async function vignette(ctx: Ctx, chemin: string, style: Style, cx: number, haut: number) {
  const m = DODONT[style];
  const cy = haut + m.boite.h / 2;
  if (chemin === ATALA) return logoAtala(ctx, cx, cy, m.atala);
  const img = await image(chemin);
  if (style === "objets") contenir(ctx, img, cx, cy, m.boite.l, m.boite.h);
  else remplir(ctx, img, cx - m.boite.l / 2, haut, m.boite.l, m.boite.h);
}

async function dodont(ctx: Ctx, s: Slide, style: Style, c: TexteDodont) {
  const m = DODONT[style];
  const imgDo = s.do ?? [];
  const imgDont = s.dont ?? [];
  if (imgDo.length !== 3 || imgDont.length !== 2) throw new Error(`« do & don'ts » : 3 Do et 2 Don't (trouvé ${imgDo.length} et ${imgDont.length})`);
  if (c.do.length !== 3 || c.dont.length !== 2) throw new Error(`« ${c.titre} » : 3 légendes Do et 2 Don't`);
  titre(ctx, c.titre, REF.l / 2, m.titre, COUV.taille, COUV.pas);
  entete(ctx, "Do", m.do);
  for (const [i, chemin] of imgDo.entries()) {
    await vignette(ctx, chemin, style, m.xDo[i], m.hautDo);
    legende(ctx, c.do[i], m.xDo[i], m.hautDo + m.boite.h + m.leg, m.max);
  }
  entete(ctx, "Don’t", m.dont);
  for (const [i, chemin] of imgDont.entries()) {
    await vignette(ctx, chemin, style, m.xDont[i], m.hautDont);
    legende(ctx, c.dont[i], m.xDont[i], m.hautDont + m.boite.h + m.leg, m.max);
  }
}

// --- La grille ----------------------------------------------------------------

/** Sa grille (« à éviter ») : titre de 139 (base 279), rangées de 385 à 412, 992 et 1572, colonnes 404, 909, 1416. */
const GRILLE = { taille: 139, base: 279, rangees: [412, 992, 1572], x: [404, 909, 1416], boite: { l: 400, h: 385 }, leg: 80, max: 13, atala: 320 };

async function grille(ctx: Ctx, s: Slide, c: TexteGrille) {
  const imgs = s.images ?? [];
  if (![6, 9].includes(imgs.length) || c.legendes.length !== imgs.length) throw new Error(`grille : 6 ou 9 images, autant de légendes (trouvé ${imgs.length} et ${c.legendes.length})`);
  titre(ctx, c.titre, REF.l / 2, GRILLE.base, GRILLE.taille, GRILLE.taille + 10);
  for (const [i, chemin] of imgs.entries()) {
    const cx = GRILLE.x[i % 3];
    const haut = GRILLE.rangees[Math.floor(i / 3)];
    const cy = haut + GRILLE.boite.h / 2;
    if (chemin === ATALA) await logoAtala(ctx, cx, cy, GRILLE.atala);
    else contenir(ctx, await image(chemin), cx, cy, GRILLE.boite.l, GRILLE.boite.h);
    legende(ctx, c.legendes[i], cx, haut + GRILLE.boite.h + GRILLE.leg, GRILLE.max);
  }
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = COULEUR.fond;
  ctx.fillRect(0, 0, L, H);
  ctx.scale(K, K);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture);
  else if (s.type === "dodont") await dodont(ctx, s, s.style ?? post.style, c as TexteDodont);
  else if (s.type === "grille") await grille(ctx, s, c as TexteGrille);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
