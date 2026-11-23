// Un original (posts/<id>.json) et le rendu de ses slides, au style de
// @dorian.frog (relevé du 15/11), en 1080 × 1440 :
// - format `liste` (« 5 niche ways to disgustingly improve your critical
//   thinking ») : fond blanc, Inter fine ; la couverture porte le titre, une
//   image large (un cerveau en IRM chez lui) avec sa petite légende entre
//   parenthèses, et sa grenouille qui dépasse du bas ;
//   chaque item : son titre, parfois « difficulty: 35/50 » et une phrase en
//   bleu-vert, le texte à gauche, une image (un tableau, une photo) à droite ;
// - format `iceberg` (« Iceberg of ADHD hobbies », 2 slides) : SA couverture
//   bleu nuit, « Iceberg of » / son iceberg dans l'ovale / « ADHD hobbies » ;
//   puis SON iceberg sur fond gris clair (vidé de ses objets), ses étages
//   séparés par des traits blancs, chaque hobby en petite image détourée avec
//   son nom, et « disagreed? ».
// Sophia entre comme un item natif de la liste (un téléphone qui montre
// l'appli, à la place de son « btw, Wondering can teach you all that ») ou
// comme un hobby de l'iceberg (son icône).

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1440;

/** Couleurs relevées sur ses slides (15/11). */
export const COULEUR = {
  fond: "#ffffff",
  texte: "#0a0a0a",
  /** Sa phrase en bleu-vert (« you could've just used sqlite. »). */
  citation: "#77b9c3",
  legende: "#1a1a1a",
  /** Les traits d'étage de l'iceberg. */
  trait: "#ffffff",
} as const;

/** Les écrans de Sophia (captures de l'appli données par Adrien le 15/11, dans un téléphone), pour l'item Sophia. */
export const TELEPHONES = ["accueil", "quiz", "cours"] as const;
export type Telephone = (typeof TELEPHONES)[number];

export type CouvertureListe = {
  /** Le titre, en minuscules comme chez lui (« 5 niche ways to disgustingly improve your critical thinking »). */
  titre: string;
  /** L'image large sous le titre (`images/…`), plutôt plus large que haute. */
  image: string;
  /** Sa petite légende entre parenthèses (« (neuroscience backed) », « (good luck) »). */
  legende?: string;
};
export type Item = {
  titre: string;
  /** « 35/50 » : écrit « difficulty: 35/50 » sous le titre. */
  difficulte?: string;
  /** Une phrase en bleu-vert avant le texte. */
  citation?: string;
  texte: string;
  /** L'image de droite (`images/…`). */
  image?: string;
  /** L'écran de Sophia (item Sophia), à droite, coupé par le bas. */
  telephone?: Telephone;
  /** Le haut de l'image de droite (480 par défaut). */
  imageY?: number;
};
/** `variante` (0 à 6) : son décor cadré autrement pour que chaque langue ait sa couverture (miroir, zoom, teinte), sans changer son style. */
export type CouvertureIceberg = { haut: string; bas: string; note?: string; variante?: number };

/** Les variantes du décor de couverture : miroir, zoom (centré sur l'ovale) et teinte. */
const VARIANTES_ICEBERG = [
  { miroir: false, zoom: 1, teinte: 0 },
  { miroir: true, zoom: 1, teinte: 0 },
  { miroir: false, zoom: 1.1, teinte: 12 },
  { miroir: true, zoom: 1.1, teinte: -12 },
  { miroir: false, zoom: 1, teinte: -18 },
  { miroir: true, zoom: 1.15, teinte: 18 },
  { miroir: false, zoom: 1.15, teinte: 25 },
] as const;
/** Un hobby de l'iceberg : son nom et son image détourée (`images/objets/….png`), ou `"sophia"` pour l'icône de l'appli. */
export type Hobby = { t: string; image: string };
export type Iceberg = { etages: Hobby[][]; question?: string };

export type TypeSlide = "couverture" | "item" | "iceberg_couverture" | "iceberg";
export type Slide = {
  type: TypeSlide;
  /** `sophia` sur LA slide de l'appli (une seule : l'item Sophia, ou la slide de l'iceberg). */
  app?: "sophia";
  [langue: string]: unknown;
};

export type Post = {
  id: string;
  format: "liste" | "iceberg";
  /** Le post de @dorian.frog qui sert de preuve (format et sujet qui ont marché). */
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
/** La slide Sophia, que l'OS marque `position_sophia`. */
export const estSlideSophia = (s: Slide) => s.app === "sophia" && s.type !== "couverture" && s.type !== "iceberg_couverture";

/** Les textes d'une slide, pour la note de pertinence. */
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") return `${c.titre} ${c.legende ?? ""}`.trim();
  if (s.type === "item") return [c.titre, c.difficulte ? `${DIFFICULTE[langue] ?? DIFFICULTE.en}: ${c.difficulte}` : "", c.citation ?? "", c.texte].filter(Boolean).join(" — ");
  if (s.type === "iceberg_couverture") return `${c.haut} ${c.bas}`;
  return (c as Iceberg).etages.map((e, i) => `${i + 1}. ${e.map((h) => h.t).join(", ")}`).join(" ; ");
}

// ---------------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------------

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

const cache = new Map<string, Image>();
async function image(chemin: string): Promise<Image> {
  const plein = join(RACINE, chemin);
  if (!existsSync(plein)) throw new Error(`image absente : ${chemin}`);
  if (!cache.has(plein)) cache.set(plein, await loadImage(readFileSync(plein)));
  return cache.get(plein)!;
}

/** Coupe un texte mot à mot pour tenir dans `largeur`. */
function couper(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const para of t.split("\n")) {
    let cur = "";
    for (const mot of para.split(" ")) {
      const essai = cur ? `${cur} ${mot}` : mot;
      if (!cur || ctx.measureText(essai).width <= largeur) cur = essai;
      else {
        lignes.push(cur);
        cur = mot;
      }
    }
    lignes.push(cur);
  }
  return lignes;
}

/** Écrit des lignes calées à gauche ; renvoie la base de la dernière. */
function paragraphe(ctx: Ctx, t: string, o: { x: number; base: number; police: string; taille: number; pas: number; largeur: number; couleur?: string }): number {
  ctx.font = `${o.taille}px "${o.police}"`;
  ctx.fillStyle = o.couleur ?? COULEUR.texte;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const lignes = couper(ctx, t, o.largeur);
  lignes.forEach((l, i) => ctx.fillText(l, o.x, o.base + i * o.pas));
  return o.base + (lignes.length - 1) * o.pas;
}

/** Une image dans une boîte, sans la couper (`contain`) ; renvoie sa boîte réelle. */
function poser(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number, centrer = true): { x: number; y: number; l: number; h: number } {
  const k = Math.min(l / img.width, h / img.height);
  const w = img.width * k;
  const hh = img.height * k;
  const xx = centrer ? x + (l - w) / 2 : x;
  ctx.drawImage(img, xx, y, w, hh);
  return { x: xx, y, l: w, h: hh };
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

// ---------------------------------------------------------------------------
// Format `liste`
// ---------------------------------------------------------------------------

/**
 * Mesures (slides de 1 080 × 1 440) : titre de couverture en Inter Display
 * Light 72 px, à x 72, première base à y 318, 94 px d'une ligne à l'autre ;
 * l'image 165 px sous la dernière base, dans 916 × 520 ; la légende en 24 px,
 * 38 px sous l'image ; sa grenouille (assets/grenouille.png) à x 320, y 1 170, coupée par le bas.
 * Item : titre 68 px à x 51 (base 305, 86 px entre deux lignes), difficulté
 * 40 px 78 px dessous, phrase en bleu-vert et texte en Inter Light 40 et 42 px
 * (58 et 59 px entre deux lignes) dans la colonne de gauche (470 px) ; image à
 * droite dans 450 × 720 à partir de x 575.
 */
const COUV = { x: 72, base: 318, taille: 72, pas: 94, largeur: 940, ecartImage: 165, image: { x: 83, l: 916, h: 520 }, legende: 30 };
const ITEM = { x: 52, base: 305, taille: 68, pas: 86, largeur: 970, colonne: 470, image: { x: 575, l: 450, h: 720, y: 480 }, telephone: { x: 560, l: 470, y: 640 } };

async function couvertureListe(ctx: Ctx, c: CouvertureListe) {
  const bas = paragraphe(ctx, c.titre, { x: COUV.x, base: COUV.base, police: POLICE.titre, taille: COUV.taille, pas: COUV.pas, largeur: COUV.largeur });
  const y = bas + COUV.ecartImage;
  const b = poser(ctx, await image(c.image), COUV.image.x, y, COUV.image.l, COUV.image.h);
  if (c.legende) {
    ctx.font = `${COUV.legende}px "${POLICE.texte}"`;
    ctx.fillStyle = COULEUR.legende;
    ctx.textAlign = "center";
    ctx.fillText(c.legende, L / 2, b.y + b.h + 38);
  }
  // Sa grenouille, exactement à sa place sur ses couvertures (coupée par le bas).
  ctx.drawImage(await image("assets/grenouille.png"), 320, 1170);
}

/** « difficulty: » dans la langue du deck. */
const DIFFICULTE: Record<string, string> = { en: "difficulty", de: "schwierigkeit", it: "difficoltà", "pt-BR": "dificuldade", tr: "zorluk", sv: "svårighet", nl: "moeilijkheid", hu: "nehézség" };

/**
 * L'écran de Sophia dans la langue du deck : `assets/sophia/<langue>/telephone-<écran>.jpg`
 * (captures de l'appli dans cette langue, celles du podz 1 mises dans un téléphone),
 * sinon l'accueil dans cette langue, sinon l'écran anglais (`assets/sophia/`).
 */
export function cheminTelephone(ecran: string, langue: string): string {
  for (const f of [`assets/sophia/${langue}/telephone-${ecran}.jpg`, `assets/sophia/${langue}/telephone-accueil.jpg`]) if (langue !== "en" && existsSync(join(RACINE, f))) return f;
  return `assets/sophia/telephone-${ecran}.jpg`;
}

async function item(ctx: Ctx, c: Item, langue = "en") {
  let base = paragraphe(ctx, c.titre, { x: ITEM.x, base: ITEM.base, police: POLICE.titre, taille: ITEM.taille, pas: ITEM.pas, largeur: ITEM.largeur });
  if (c.difficulte) base = paragraphe(ctx, `${DIFFICULTE[langue] ?? DIFFICULTE.en}: ${c.difficulte}`, { x: ITEM.x + 4, base: base + 78, police: POLICE.texte, taille: 40, pas: 58, largeur: ITEM.largeur });
  if (c.citation) base = paragraphe(ctx, c.citation, { x: ITEM.x + 6, base: base + (c.difficulte ? 157 : 130), police: POLICE.texte, taille: 40, pas: 58, largeur: ITEM.colonne, couleur: COULEUR.citation });
  paragraphe(ctx, c.texte, { x: ITEM.x + 2, base: base + (c.citation ? 100 : c.difficulte ? 150 : 120), police: POLICE.texte, taille: 42, pas: 59, largeur: ITEM.colonne });
  if (c.telephone) {
    const t = await image(cheminTelephone(c.telephone, langue));
    const w = ITEM.telephone.l;
    ctx.drawImage(t, ITEM.telephone.x, c.imageY ?? ITEM.telephone.y, w, (t.height * w) / t.width);
  } else if (c.image) {
    poser(ctx, await image(c.image), ITEM.image.x, c.imageY ?? ITEM.image.y, ITEM.image.l, ITEM.image.h);
  }
}

// ---------------------------------------------------------------------------
// Format `iceberg`
// ---------------------------------------------------------------------------

/**
 * Mesures (son post à 2 M, 1 080 × 1 440) et SES décors : la couverture
 * (assets/iceberg-couverture.jpg, son ovale sur le bleu nuit, texte effacé),
 * « Iceberg of » en Inter Regular 120 px centré, base à y 211, « Autistic
 * hobbies » en 112 px, base à y 1 226 ; la slide (assets/iceberg.jpg, son
 * iceberg vidé de ses objets) : traits d'étage blancs à y 354, 609, 867 et
 * 1 125 (de x 89 à 992) ; chaque hobby, une image de 150 px au plus posée sur
 * son nom (34 px, deux lignes au plus), le dernier étage fini à y 1 330 ;
 * « disagreed? » en 40 px à x 32, base 1 345.
 */
const ICE = {
  haut: { base: 211, taille: 120 },
  bas: { base: 1226, taille: 112 },
  traits: [354, 609, 867, 1125],
  x0: 89,
  x1: 992,
  hautPremier: 40,
  objet: 160,
  etiquette: 34,
  /** Le bas du dernier étage (son « polymathy » finit vers y 1 300). */
  basDernier: 1330,
  question: { x: 32, base: 1345, taille: 40 },
};

async function icebergCouverture(ctx: Ctx, c: CouvertureIceberg) {
  const v = VARIANTES_ICEBERG[(c.variante ?? 0) % VARIANTES_ICEBERG.length];
  const fond = await image("assets/iceberg-couverture.jpg");
  // Le bleu nuit du coin, pour remplir quand le décor est dézoomé.
  ctx.fillStyle = "#0f1f30";
  ctx.fillRect(0, 0, L, H);
  ctx.save();
  if (v.teinte) ctx.filter = `hue-rotate(${v.teinte}deg)`;
  ctx.translate(L / 2, 720);
  ctx.scale(v.miroir ? -v.zoom : v.zoom, v.zoom);
  ctx.drawImage(fond, -L / 2, -720, L, H);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  for (const [t, o] of [
    [c.haut, ICE.haut],
    [c.bas, ICE.bas],
  ] as const) {
    let s = o.taille;
    ctx.font = `${s}px "${POLICE.iceberg}"`;
    while (ctx.measureText(t).width > 980 && s > 50) ctx.font = `${(s -= 2)}px "${POLICE.iceberg}"`;
    ctx.fillText(t, L / 2, o.base);
  }
  if (c.note) {
    ctx.font = `28px "${POLICE.iceberg}"`;
    ctx.fillText(c.note, L / 2, ICE.bas.base + 52);
  }
}

async function icone(ctx: Ctx, x: number, y: number, cote: number) {
  const img = await image("assets/sophia/icone.jpg");
  ctx.save();
  rectArrondi(ctx, x, y, cote, cote, cote * 0.225);
  ctx.clip();
  ctx.drawImage(img, x, y, cote, cote);
  ctx.restore();
}

async function iceberg(ctx: Ctx, c: Iceberg) {
  ctx.drawImage(await image("assets/iceberg.jpg"), 0, 0, L, H);
  ctx.strokeStyle = COULEUR.trait;
  ctx.lineWidth = 5;
  for (const y of ICE.traits) {
    ctx.beginPath();
    ctx.moveTo(ICE.x0, y);
    ctx.lineTo(ICE.x1, y);
    ctx.stroke();
  }
  if (c.etages.length > ICE.traits.length + 1) throw new Error(`iceberg : ${ICE.traits.length + 1} étages au plus`);
  const bornes = [ICE.hautPremier, ...ICE.traits, ICE.basDernier];
  for (const [i, etage] of c.etages.entries()) {
    if (etage.length > 4) throw new Error(`iceberg : 4 hobbies par étage au plus (étage ${i + 1})`);
    const haut = bornes[i] + 14;
    const bas = bornes[i + 1] - 22;
    const pas = (ICE.x1 - ICE.x0) / etage.length;
    for (const [j, h] of etage.entries()) {
      const cx = ICE.x0 + pas * (j + 0.5);
      ctx.font = `${ICE.etiquette}px "${POLICE.iceberg}"`;
      const lignes = couper(ctx, h.t, Math.min(pas - 10, 240));
      if (lignes.length > 2) throw new Error(`iceberg : « ${h.t} » tient sur deux lignes au plus`);
      const hauteurTexte = lignes.length * ICE.etiquette * 0.98;
      const basImage = bas - hauteurTexte - 4;
      const place = Math.min(ICE.objet, basImage - haut);
      const largeur = Math.min(pas - 24, 210);
      if (h.image === "sophia") await icone(ctx, cx - place * 0.42, basImage - place * 0.84, place * 0.84);
      else {
        const img = await image(h.image);
        const kk = Math.min(largeur / img.width, place / img.height);
        ctx.drawImage(img, cx - (img.width * kk) / 2, basImage - img.height * kk, img.width * kk, img.height * kk);
      }
      ctx.fillStyle = COULEUR.texte;
      ctx.textAlign = "center";
      lignes.forEach((l, n) => ctx.fillText(l, cx, bas - (lignes.length - 1 - n) * ICE.etiquette * 0.98));
    }
  }
  if (c.question) {
    ctx.font = `${ICE.question.taille}px "${POLICE.iceberg}"`;
    ctx.fillStyle = COULEUR.texte;
    ctx.textAlign = "left";
    ctx.fillText(c.question, ICE.question.x, ICE.question.base);
  }
}

/** Rend une slide en JPEG 1080 × 1440, sans métadonnées. */
export async function rendreSlide(_post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = COULEUR.fond;
  ctx.fillRect(0, 0, L, H);
  const c = contenu<unknown>(s, langue);
  if (!c) throw new Error(`slide ${s.type} : rien en ${langue}`);
  if (s.type === "couverture") await couvertureListe(ctx, c as CouvertureListe);
  else if (s.type === "item") await item(ctx, c as Item, langue);
  else if (s.type === "iceberg_couverture") await icebergCouverture(ctx, c as CouvertureIceberg);
  else await iceberg(ctx, c as Iceberg);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 93));
}
