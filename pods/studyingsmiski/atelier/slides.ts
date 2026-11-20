// Un remake (posts/<id>.json) et le rendu de ses slides, au style exact de
// @studyingsmiski (relevé du 20/11 : « 4 apps you need as a student! »,
// 678 k), en 1080 × 1080 :
// - un fond (son ciel bleu en papier plié, l'herbe et la barrière en bas) ;
// - une grande carte en timbre-poste (papier gris clair ligné, bords
//   dentelés à l'ombre noire) qui porte le texte ;
// - des stickers détourés au liseré blanc, un polaroid, une bulle manuscrite ;
// - la couverture : le titre rond et gras, le sous-titre à la main ;
// - une slide par appli : son icône, son nom, ses plateformes, sa description.
//   Là où elle met Turbo AI, on met Sophia et sa vraie icône de l'App Store
//   (demande d'Adrien du 20/11) : `"sophia": true`.
// Toutes les mesures sont prises sur ses slides de 1080 × 1080.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE, policeMain, policeTitre } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1080;

const ENCRE = "#111111";
const PAPIER = "#ececec";
const LIGNE = "#dcdcdc";
const ICONE_SOPHIA = "assets/sophia/icone.jpg";

/** Un élément posé sur la slide, dans l'ordre (`dessous` : avant la carte). */
export type Element =
  | { type: "sticker"; image: string; x: number; y: number; l: number; rotation?: number; dessous?: boolean }
  | { type: "polaroid"; image: string; x: number; y: number; l: number; h: number; rotation?: number; dessous?: boolean }
  | { type: "bulle"; x: number; y: number; l: number; h: number; queue: { x: number; y: number }; dessous?: boolean };

export type TypeSlide = "couverture" | "appli";
/**
 * Une slide. Le fond, la carte et les éléments sont au niveau de la slide
 * (les mêmes dans toutes les langues), les textes sous la clé de chaque langue :
 * - couverture : texte `{ "titre": "4 apps you\nneed as a\nstudent!", "sous": "from a straight\nA student" }` ;
 * - appli : `icone` (images/applis/<nom>/icone.jpg ; rien pour Sophia) ; texte
 *   `{ "nom": "Flora", "plateformes": "iOS, Android", "texte": "…", "bulle"?: "…" }` ;
 *   `"sophia": true` sur LA slide Sophia (son icône de l'App Store, `assets/sophia/icone.jpg`).
 * `carte` (facultatif) : la place de la carte `{ x, y, l, h }`, sinon celle de son gabarit.
 * `max_lignes` (facultatif, appli) : les lignes de description permises (6 par défaut), moins quand un
 *   polaroid ou un sticker monte sous le texte ; `npm run mesure` et le rendu le vérifient dans chaque langue.
 */
export type Slide = {
  type: TypeSlide;
  fond: string;
  icone?: string;
  sophia?: boolean;
  carte?: { x: number; y: number; l: number; h: number };
  max_lignes?: number;
  /** Couverture : la largeur libre du titre entre les stickers (sinon toute la carte). */
  titre_largeur?: number;
  elements?: Element[];
  [langue: string]: unknown;
};
export type TexteCouverture = { titre: string; sous?: string; bulle?: string };
export type TexteAppli = { nom: string; plateformes: string; texte: string; bulle?: string };

export type Post = {
  id: string;
  /** Son post qui est refait (format et accroche qui ont marché). */
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
/** La slide de l'appli, que l'OS marque `position_app`. */
export const estSlideSophia = (s: Slide) => s.sophia === true;
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, string>>(s, langue);
  if (!c) return "";
  return [c.titre, c.sous, c.nom, c.plateformes, c.texte, c.bulle].filter(Boolean).join(" — ").replace(/\n/g, " ");
}
export const imagesSlide = (s: Slide): string[] => [s.fond, ...(s.icone ? [s.icone] : []), ...(s.elements ?? []).flatMap((e) => ("image" in e ? [e.image] : []))];

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

function couper(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const para of t.split("\n")) {
    let ligne = "";
    // Coupe aux espaces ordinaires seulement : l'espace insécable (U+00A0, avant « ! ? : ; » en français) tient les mots ensemble.
    for (const mot of para.split(/[ \t]+/).filter(Boolean)) {
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

// --- Le timbre ------------------------------------------------------------------

/** Le contour dentelé d'un timbre : des demi-cercles creusés tout le long des bords. */
function cheminTimbre(ctx: Ctx, x: number, y: number, l: number, h: number, r = 14, pas = 46) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  const bord = (x0: number, y0: number, x1: number, y1: number) => {
    const long = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(long / pas));
    const dx = (x1 - x0) / long;
    const dy = (y1 - y0) / long;
    const seg = long / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + dx * (seg * i + seg / 2);
      const cy = y0 + dy * (seg * i + seg / 2);
      const a = Math.atan2(dy, dx);
      // Le demi-cercle creusé vers l'intérieur de la carte.
      ctx.lineTo(cx - dx * r, cy - dy * r);
      ctx.arc(cx, cy, r, a + Math.PI, a, true);
      ctx.lineTo(x0 + dx * seg * (i + 1), y0 + dy * seg * (i + 1));
    }
  };
  bord(x, y, x + l, y);
  bord(x + l, y, x + l, y + h);
  bord(x + l, y + h, x, y + h);
  bord(x, y + h, x, y);
  ctx.closePath();
}

/** Sa carte : l'ombre noire décalée qui dessine les dents, le papier gris clair ligné. */
function timbre(ctx: Ctx, x: number, y: number, l: number, h: number) {
  ctx.save();
  ctx.translate(6, 6);
  cheminTimbre(ctx, x, y, l, h);
  ctx.fillStyle = ENCRE;
  ctx.fill();
  ctx.restore();
  cheminTimbre(ctx, x, y, l, h);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = PAPIER;
  ctx.fillRect(x - 20, y - 20, l + 40, h + 40);
  ctx.fillStyle = LIGNE;
  for (let yy = y + 30; yy < y + h; yy += 34) ctx.fillRect(x, yy, l, 1.5);
  ctx.restore();
}

// --- Les éléments ----------------------------------------------------------------

/** Un sticker : l'image détourée, son liseré blanc (5 px) et une ombre douce. */
async function sticker(ctx: Ctx, chemin: string, x: number, y: number, l: number, rotation = 0) {
  const img = await image(chemin);
  const k = l / img.width;
  const w = l;
  const hh = img.height * k;
  const bord = 6;
  const tmp = createCanvas(Math.ceil(w + bord * 2), Math.ceil(hh + bord * 2));
  const t = tmp.getContext("2d");
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    t.drawImage(img, bord + Math.cos(ang) * bord, bord + Math.sin(ang) * bord, w, hh);
  }
  t.globalCompositeOperation = "source-in";
  t.fillStyle = "#ffffff";
  t.fillRect(0, 0, tmp.width, tmp.height);
  t.globalCompositeOperation = "source-over";
  t.drawImage(img, bord, bord, w, hh);
  ctx.save();
  ctx.translate(x + w / 2, y + hh / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 6;
  ctx.drawImage(tmp, -tmp.width / 2, -tmp.height / 2);
  ctx.restore();
}

/** Un polaroid : la photo dans un cadre blanc, un peu penché. */
async function polaroid(ctx: Ctx, chemin: string, x: number, y: number, l: number, h: number, rotation = 0) {
  const img = await image(chemin);
  const m = 12;
  ctx.save();
  ctx.translate(x + l / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#fbfbfb";
  ctx.fillRect(-l / 2, -h / 2, l, h);
  ctx.shadowColor = "transparent";
  const iw = l - m * 2;
  const ih = h - m * 2;
  const kk = Math.max(iw / img.width, ih / img.height);
  const sw = iw / kk;
  const sh = ih / kk;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -l / 2 + m, -h / 2 + m, iw, ih);
  ctx.restore();
}

/** Sa bulle : une forme ronde au trait noir épais, sa pointe, le texte à la main centré. */
function bulle(ctx: Ctx, e: Extract<Element, { type: "bulle" }>, texte: string, langue: string) {
  const cx = e.x + e.l / 2;
  const cy = e.y + e.h / 2;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = ENCRE;
  ctx.fillStyle = "#f6f6f4";
  // La pointe d'abord (sous la bulle), puis la bulle par-dessus : un seul contour.
  const ang = Math.atan2(e.queue.y - cy, e.queue.x - cx);
  const base = 34;
  const px = cx + Math.cos(ang) * (e.l / 2) * 0.82;
  const py = cy + Math.sin(ang) * (e.h / 2) * 0.82;
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(ang + Math.PI / 2) * base, py + Math.sin(ang + Math.PI / 2) * base);
  ctx.lineTo(e.queue.x, e.queue.y);
  ctx.lineTo(px + Math.cos(ang - Math.PI / 2) * base, py + Math.sin(ang - Math.PI / 2) * base);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, e.l / 2, e.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Recouvre le trait de la pointe à l'intérieur de la bulle.
  ctx.beginPath();
  ctx.ellipse(cx, cy, e.l / 2 - 3, e.h / 2 - 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.font = `${langue === "en" ? 46 : 42}px "${policeMain(langue)}"`;
  ctx.letterSpacing = "1px";
  const lignes = couper(ctx, texte, e.l * 0.66);
  const pas = 44;
  // Le texte doit tenir dans l'ellipse : sinon, raccourcis-le ou agrandis la bulle.
  if ((lignes.length - 1) * pas + 46 > e.h * 0.75 || lignes.length > 5)
    throw new Error(`bulle trop pleine (${lignes.length} lignes pour ${e.h} px de haut) : « ${texte} »`);
  const base0 = cy - ((lignes.length - 1) * pas) / 2 + 14;
  for (const [i, l] of lignes.entries()) ctx.fillText(l, cx, base0 + i * pas);
  ctx.letterSpacing = "0px";
}

async function elements(ctx: Ctx, s: Slide, texteBulle: string | undefined, dessous: boolean, langue: string) {
  for (const e of s.elements ?? []) {
    if (Boolean(e.dessous) !== dessous) continue;
    if (e.type === "sticker") await sticker(ctx, e.image, e.x, e.y, e.l, e.rotation);
    else if (e.type === "polaroid") await polaroid(ctx, e.image, e.x, e.y, e.l, e.h, e.rotation);
    else if (e.type === "bulle") {
      if (!texteBulle) throw new Error("une bulle sans texte (`bulle` dans la langue)");
      bulle(ctx, e, texteBulle, langue);
    }
  }
}

// --- Les slides --------------------------------------------------------------------

/** Ses mesures (couverture) : carte 600 × 605 à (240, 245) ; titre Fredoka Bold 92 px resserré (ses lignes font ~420 px), lignes tous les 82 ; sous-titre à la main 52 px, lignes tous les 44. */
const COUV = { carte: { x: 240, y: 245, l: 600, h: 605 }, titre: { taille: 92, pas: 82 }, sous: { taille: 52, pas: 44, ecart: 68 } };

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture, langue: string) {
  const k = s.carte ?? COUV.carte;
  await elements(ctx, s, c.bulle, true, langue);
  timbre(ctx, k.x, k.y, k.l, k.h);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  // `titre_largeur` : la largeur libre entre les stickers ; une langue aux mots plus longs y tient en
  // réduisant le titre (jamais sous 72 px), plutôt que de passer sous un sticker.
  const libre = s.titre_largeur ?? k.l - 70;
  ctx.letterSpacing = "-2px";
  ctx.font = `${COUV.titre.taille}px "${policeTitre(langue)}"`;
  const large = Math.max(...c.titre.split("\n").map((l) => ctx.measureText(l).width));
  const taille = Math.max(72, Math.min(COUV.titre.taille, Math.floor((COUV.titre.taille * libre) / large)));
  const pas = Math.round((COUV.titre.pas * taille) / COUV.titre.taille);
  ctx.font = `${taille}px "${policeTitre(langue)}"`;
  const titre = couper(ctx, c.titre, k.l - 70);
  if (titre.some((l) => ctx.measureText(l).width > libre + 1)) throw new Error(`titre trop large en ${langue} : « ${c.titre.replace(/\n/g, " / ")} »`);
  ctx.font = `${COUV.sous.taille}px "${policeMain(langue)}"`;
  const sous = c.sous ? couper(ctx, c.sous, k.l - 120) : [];
  const hauteur = (titre.length - 1) * pas + 64 + (sous.length ? COUV.sous.ecart + (sous.length - 1) * COUV.sous.pas : 0);
  const base0 = k.y + (k.h - hauteur) / 2 + 64;
  ctx.font = `${taille}px "${policeTitre(langue)}"`;
  ctx.letterSpacing = "-2px";
  for (const [i, l] of titre.entries()) ctx.fillText(l, k.x + k.l / 2, base0 + i * pas);
  ctx.letterSpacing = "1.5px";
  ctx.font = `${COUV.sous.taille}px "${policeMain(langue)}"`;
  const baseSous = base0 + (titre.length - 1) * pas + COUV.sous.ecart;
  for (const [i, l] of sous.entries()) ctx.fillText(l, k.x + k.l / 2, baseSous + i * COUV.sous.pas);
  ctx.letterSpacing = "0px";
  await elements(ctx, s, c.bulle, false, langue);
}

/**
 * Ses mesures (slide « Turbo AI ») : carte 750 × 742 à (165, 178) ; icône
 * 145 px à (230, 228), coins arrondis ; le nom en Figtree Bold 82 px à x 400,
 * ligne de base 300 ; les plateformes en Figtree Bold 42 px, base 360 ; la
 * description en Figtree Regular 50 px à x 226, première base 452, lignes
 * tous les 44, sur 610 px.
 */
const APPLI = {
  carte: { x: 165, y: 178, l: 750, h: 742 },
  icone: { dx: 65, dy: 50, cote: 145 },
  nom: { dx: 235, base: 122, taille: 82, largeur: 450 },
  plateformes: { base: 182, taille: 42 },
  texte: { dx: 61, base: 274, taille: 50, pas: 48, largeur: 610 },
};

async function appli(ctx: Ctx, s: Slide, c: TexteAppli, langue: string) {
  const k = s.carte ?? APPLI.carte;
  await elements(ctx, s, c.bulle, true, langue);
  timbre(ctx, k.x, k.y, k.l, k.h);
  // L'icône de l'App Store (celle de Sophia sur sa slide), arrondie ici comme sur iOS.
  const a = APPLI.icone;
  const xi = k.x + a.dx;
  const yi = k.y + a.dy;
  const icone = s.sophia ? ICONE_SOPHIA : s.icone;
  if (!icone) throw new Error(`« ${c.nom} » : pas d'icône (images/applis/<nom>/icone.jpg)`);
  ctx.save();
  rectArrondi(ctx, xi, yi, a.cote, a.cote, a.cote * 0.2237);
  ctx.clip();
  ctx.drawImage(await image(icone), xi, yi, a.cote, a.cote);
  ctx.restore();
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "left";
  ctx.letterSpacing = "-1px";
  let taille = APPLI.nom.taille;
  ctx.font = `${taille}px "${POLICE.gras}"`;
  const w = ctx.measureText(c.nom).width;
  if (w > APPLI.nom.largeur) taille = Math.floor((taille * APPLI.nom.largeur) / w);
  ctx.font = `${taille}px "${POLICE.gras}"`;
  ctx.fillText(c.nom, k.x + APPLI.nom.dx, k.y + APPLI.nom.base);
  ctx.font = `${APPLI.plateformes.taille}px "${POLICE.gras}"`;
  ctx.fillText(c.plateformes, k.x + APPLI.nom.dx, k.y + APPLI.plateformes.base);
  ctx.letterSpacing = "0px";
  ctx.font = `${APPLI.texte.taille}px "${POLICE.texte}"`;
  const lignes = couper(ctx, c.texte, APPLI.texte.largeur);
  const max = s.max_lignes ?? 6;
  if (lignes.length > max) throw new Error(`« ${c.nom} » (${langue}) : description trop longue (${lignes.length} lignes, ${max} au plus)`);
  for (const [i, l] of lignes.entries()) ctx.fillText(l, k.x + APPLI.texte.dx, k.y + APPLI.texte.base + i * APPLI.texte.pas);
  await elements(ctx, s, c.bulle, false, langue);
}

// ---------------------------------------------------------------------------

export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  const fond = await image(s.fond);
  const kf = Math.max(L / fond.width, H / fond.height);
  ctx.drawImage(fond, (L - fond.width * kf) / 2, (H - fond.height * kf) / 2, fond.width * kf, fond.height * kf);
  ctx.textBaseline = "alphabetic";
  const c = contenu<Record<string, unknown>>(s, langue);
  if (!c) throw new Error(`${post.id} : slide ${s.type} sans texte en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture, langue);
  else if (s.type === "appli") await appli(ctx, s, c as TexteAppli, langue);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
