// Un original (posts/<id>.json) et le rendu de ses slides, au style de
// @theappshelf (relevé du 15/11), en 1080 × 1350. Deux styles : `bibliotheque`
// (son post « my most used apps », décrit ici) et `carte` (son tube « five
// apps / every girl needs » : une fenêtre blanche sur une photo, pastilles
// roses, la fin dans une fenêtre avec étoiles et icônes) :
// - la couverture : un collage de trois photos (une en haut, deux en bas), le
//   titre en grand au milieu, en sans-serif serré avec un mot en italique
//   (« my most / used apps »), et une pastille jaune (« 📍 as someone with ADHD ») ;
// - une slide par appli, sur la même photo assombrie : son nom en grand, une
//   pastille « iOS », ses trois premières captures de l'App Store, et une
//   note façon iOS Notes (« < Notes ») qui dit ce qu'elle fait ;
// - la fin : « save & follow » et « [ for more app recs! ] » sur la photo, avec
//   l'interface de l'appareil photo de l'iPhone.
// Sophia est une des cinq applis (ses vraies captures : accueil, quiz, cours
// fini), jamais la première ni la dernière.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1350;

/** Couleurs relevées sur ses slides (15/11). */
export const COULEUR = {
  blanc: "#ffffff",
  /** Le blanc chaud de « my » et « used ». */
  blancCasse: "#ece8e2",
  /** Ses pastilles (« iOS », « as someone with ADHD ») et la bande « [ for more app recs! ] ». */
  jaune: "#fcf2b4",
  texteJaune: "#2b2b2b",
  /** La note : fond, « Notes » et ses icônes, texte. */
  note: "rgba(236, 236, 236, 0.9)",
  notesJaune: "#d99f22",
  noteTexte: "#4a4a4a",
  /** Le jaune de « PHOTO » dans l'appareil photo. */
  photo: "#f5c84c",
  /** Style `carte` (son tube « five apps / every girl needs ») : le rose du sous-titre, sa bande et ses pastilles. */
  rose: "#c4426e",
  roseBande: "#f6d4de",
  rosePastille: "#f9d9e4",
  noir: "#141414",
} as const;

/** Un morceau de titre de couverture : sans-serif serré (`gras`), son blanc cassé (`clair`), ou italique (`script`). */
export type Morceau = { t: string; style?: "gras" | "clair" | "script" };
export type Couverture = {
  /** Trois photos (haut, bas gauche, bas droite) ou une seule, plein cadre. */
  photos: string[];
  /** Style `bibliotheque` : deux lignes, `[[{ "t": "my" }, { "t": "most", "style": "script" }], [{ "t": "used", "style": "clair" }, { "t": "apps" }]]`. */
  lignes?: Morceau[][];
  /** La pastille jaune sous le titre, avec l'épingle (« as someone with ADHD »). */
  pastille?: string;
  /** Style `carte` : le titre noir de la fenêtre (« five apps ») et le sous-titre rose (« every girl needs »). */
  titre?: string;
  sous?: string;
};
export type AppliSlide = {
  nom: string;
  /** Ses pastilles (« iOS » par défaut). */
  etiquettes?: string[];
  /** Le dossier de l'appli (`images/applis/<nom>`, `npm run appli -- --id`) ; Sophia : ses vraies captures (`assets/sophia/ecran-1` à `3`). */
  dossier?: string;
  /** La note, 2 ou 3 lignes (« A task app that turns your to-do list into a Bingo grid… »). */
  note: string;
  /** Une photo à elle (style `carte` : une pièce différente par appli) ; sinon le `fond` du post. */
  fond?: string;
};
export type Fin = { haut: string; bande: string };

export type TypeSlide = "couverture" | "appli" | "fin";
export type Slide = { type: TypeSlide; app?: "sophia"; [langue: string]: unknown };

export type Post = {
  id: string;
  /**
   * `bibliotheque` (son post « my most used apps » : collage, fond sombre,
   * pastilles jaunes, appareil photo à la fin) ou `carte` (son tube « five
   * apps / every girl needs » : une fenêtre blanche sur une photo, pastilles
   * roses, fenêtre « save & follow » à la fin). `bibliotheque` par défaut.
   */
  style?: "bibliotheque" | "carte";
  /** La photo des slides d'appli et de la fin (`images/…`), assombrie. */
  fond: string;
  /** Le post de @theappshelf qui sert de preuve (format et accroche qui ont marché). */
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
  if (s.type === "couverture") {
    const k = c as Couverture;
    return [k.titre ?? "", k.sous ?? "", (k.lignes ?? []).map((l) => l.map((m) => m.t).join(" ")).join(" "), k.pastille ?? ""].filter(Boolean).join(" ");
  }
  if (s.type === "appli") return `${(c as AppliSlide).nom} — ${(c as AppliSlide).note}`;
  return `${(c as Fin).haut} ${(c as Fin).bande}`;
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

/** Une image qui remplit la boîte (`cover`). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number) {
  const k = Math.max(l / img.width, h / img.height);
  const sl = l / k;
  const sh = h / k;
  ctx.drawImage(img, (img.width - sl) / 2, (img.height - sh) / 2, sl, sh, x, y, l, h);
}

function rectArrondi(ctx: Ctx, x: number, y: number, l: number, h: number, r: number) {
  const rr = Math.min(r, l / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + l, y, x + l, y + h, rr);
  ctx.arcTo(x + l, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + l, y, rr);
  ctx.closePath();
}

function couper(ctx: Ctx, t: string, largeur: number): string[] {
  const lignes: string[] = [];
  let cur = "";
  for (const mot of t.split(" ")) {
    const essai = cur ? `${cur} ${mot}` : mot;
    if (!cur || ctx.measureText(essai).width <= largeur) cur = essai;
    else {
      lignes.push(cur);
      cur = mot;
    }
  }
  return [...lignes, cur];
}

function ombre(ctx: Ctx, flou: number, alpha = 0.35) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = flou;
  ctx.shadowOffsetY = flou / 4;
}
function sansOmbre(ctx: Ctx) {
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Une pastille jaune (« iOS ») ; renvoie sa largeur. */
function pastille(ctx: Ctx, t: string, x: number, y: number, h: number, taille: number, epingle = false, couleur: string = COULEUR.jaune): number {
  ctx.font = `${taille}px "${POLICE.texte}"`;
  const l = ctx.measureText(t).width + h * 0.9 + (epingle ? taille * 1.1 : 0);
  ctx.fillStyle = couleur;
  rectArrondi(ctx, x, y, l, h, h / 2);
  ctx.fill();
  let xt = x + h * 0.45;
  if (epingle) {
    // L'épingle de lieu d'iOS : une goutte et un rond, au trait.
    const cx = xt + taille * 0.38;
    const cy = y + h / 2 - taille * 0.08;
    const r = taille * 0.34;
    ctx.strokeStyle = COULEUR.texteJaune;
    ctx.lineWidth = Math.max(1.6, taille * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 0.15);
    ctx.lineTo(cx, cy + r * 1.7);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    xt += taille * 1.1;
  }
  ctx.fillStyle = COULEUR.texteJaune;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(t, xt, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return l;
}

/** Le fond des slides d'appli et de la fin : la photo, désaturée et assombrie. */
async function fond(ctx: Ctx, chemin: string, voile: number) {
  remplir(ctx, await image(chemin), 0, 0, L, H);
  ctx.fillStyle = `rgba(48, 48, 48, ${voile})`;
  ctx.fillRect(0, 0, L, H);
}

// ---------------------------------------------------------------------------
// Couverture
// ---------------------------------------------------------------------------

/**
 * Mesures (son post « my most used apps », ramené à 1 080 × 1 350) : photos
 * en collage (haut 1 080 × 675, puis deux de 540 × 675) ; deux lignes de titre
 * centrées sur x 530, bases à y 657 et 829 : sans-serif serré (Inter Display
 * SemiBold, approche −5 %) et italique (Playfair Display Italic), le tout à
 * 154 px (« used apps » : 640 px de large), une ombre douce ; la pastille de 51 px de haut, centrée, à y 896.
 */
const COUV = { centre: 530, bases: [657, 829], taille: 154, script: 1.12, largeurMax: 1000, pastille: { y: 896, h: 52, taille: 25 } };

function policeMorceau(m: Morceau, s: number): string {
  return m.style === "script" ? `${s * COUV.script}px "${POLICE.script}"` : `${s}px "${POLICE.titre}"`;
}

/** La fenêtre blanche de son style `carte` : coins de 28 px, les trois pastilles rouge, jaune, vert. */
function fenetre(ctx: Ctx, x: number, y: number, l: number, h: number) {
  ombre(ctx, 30, 0.18);
  ctx.fillStyle = "#ffffff";
  rectArrondi(ctx, x, y, l, h, 28);
  ctx.fill();
  sansOmbre(ctx);
  for (const [i, c] of ["#ff5f57", "#febc2e", "#28c840"].entries()) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + 36 + i * 30, y + 46, 8.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Une ligne surlignée d'une bande, légèrement penchée (« every girl needs », « [ for more app recs! ] »). */
function surligne(ctx: Ctx, t: string, cx: number, base: number, taille: number, couleur: string, bande: string, angle = -2.5) {
  ctx.save();
  ctx.translate(cx, base);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.font = `${taille}px "${POLICE.texte}"`;
  ctx.letterSpacing = `${-0.03 * taille}px`;
  const l = ctx.measureText(t).width + taille * 0.4;
  ctx.fillStyle = bande;
  ctx.fillRect(-l / 2, -taille * 0.82, l, taille * 1.08);
  ctx.fillStyle = couleur;
  ctx.textAlign = "center";
  ctx.fillText(t, 0, 0);
  ctx.restore();
  ctx.letterSpacing = "0px";
}

/**
 * Style `carte` (son tube à 479 k, ramené à 1 080 × 1 350) : la photo plein
 * cadre ; la fenêtre blanche x 233 à 848, y 673 à 1 056 ; « five apps » en
 * Inter Display SemiBold 100 px, approche −5 %, centré, base 880 ;
 * « every girl needs » en rose, 62 px, sur sa bande, base 953.
 */
async function couvertureCarte(ctx: Ctx, c: Couverture) {
  remplir(ctx, await image(c.photos[0]), 0, 0, L, H);
  // La fenêtre fait 615 px ; elle s'élargit (900 px au plus) pour un titre plus
  // long, comme sur son « cute and helpful » : on élargit, on ne réduit pas.
  let s = 100;
  ctx.font = `${s}px "${POLICE.titre}"`;
  ctx.letterSpacing = `${-0.05 * s}px`;
  const largeurTitre = () => ctx.measureText(c.titre ?? "").width;
  while (largeurTitre() > 820 && s > 50) {
    if (s <= 88) throw new Error(`couverture : « ${c.titre} » ne tient pas dans la fenêtre, raccourcis-le`);
    s -= 2;
    ctx.font = `${s}px "${POLICE.titre}"`;
    ctx.letterSpacing = `${-0.05 * s}px`;
  }
  const wTitre = largeurTitre();
  ctx.letterSpacing = "0px";
  ctx.font = `62px "${POLICE.texte}"`;
  ctx.letterSpacing = `${-0.03 * 62}px`;
  const largeurSous = c.sous ? ctx.measureText(c.sous).width : 0;
  const l = Math.min(900, Math.max(615, Math.round(wTitre + 70), Math.round(Math.min(largeurSous, 760) + 75)));
  ctx.letterSpacing = "0px";
  fenetre(ctx, Math.round(540 - l / 2), 673, l, 383);
  ctx.font = `${s}px "${POLICE.titre}"`;
  ctx.letterSpacing = `${-0.05 * s}px`;
  ctx.fillStyle = COULEUR.noir;
  ctx.textAlign = "center";
  ctx.fillText(c.titre ?? "", 540, 880);
  ctx.letterSpacing = "0px";
  if (c.sous) {
    let t = 62;
    ctx.font = `${t}px "${POLICE.texte}"`;
    while (ctx.measureText(c.sous).width > l - 75 && t > 30) ctx.font = `${(t -= 2)}px "${POLICE.texte}"`;
    if (t < 52) throw new Error(`couverture : « ${c.sous} » ne tient pas dans la fenêtre, raccourcis-le`);
    surligne(ctx, c.sous, 540, 953, t, COULEUR.rose, COULEUR.roseBande);
  }
}

async function couverture(ctx: Ctx, c: Couverture, style: string) {
  if (style === "carte") return couvertureCarte(ctx, c);
  if (!c.lignes?.length) throw new Error("couverture : `lignes` (style bibliotheque) ou `titre` (style carte)");
  if (c.photos.length === 3) {
    remplir(ctx, await image(c.photos[0]), 0, 0, L, H / 2);
    remplir(ctx, await image(c.photos[1]), 0, H / 2, L / 2, H / 2);
    remplir(ctx, await image(c.photos[2]), L / 2, H / 2, L / 2, H / 2);
  } else if (c.photos.length === 1) remplir(ctx, await image(c.photos[0]), 0, 0, L, H);
  else throw new Error("couverture : 1 ou 3 photos");
  if (c.lignes.length > COUV.bases.length) throw new Error(`couverture : ${COUV.bases.length} lignes au plus`);
  for (const [i, ligne] of c.lignes.entries()) {
    // Une taille commune, réduite si la ligne la plus large dépasse.
    const mesurer = (s: number) =>
      ligne.reduce((tot, m, k) => {
        ctx.font = policeMorceau(m, s);
        ctx.letterSpacing = m.style === "script" ? "0px" : `${-0.05 * s}px`;
        return tot + ctx.measureText(m.t).width + (k ? s * 0.16 : 0);
      }, 0);
    let s = COUV.taille;
    while (mesurer(s) > COUV.largeurMax && s > 60) s -= 2;
    let x = COUV.centre - mesurer(s) / 2;
    ombre(ctx, 24, 0.3);
    for (const [k, m] of ligne.entries()) {
      if (k) x += s * 0.16;
      ctx.font = policeMorceau(m, s);
      ctx.letterSpacing = m.style === "script" ? "0px" : `${-0.05 * s}px`;
      ctx.fillStyle = m.style === "clair" || (m.style !== "script" && i === 0) ? COULEUR.blancCasse : COULEUR.blanc;
      ctx.textAlign = "left";
      ctx.fillText(m.t, x, COUV.bases[i]);
      x += ctx.measureText(m.t).width;
    }
    ctx.letterSpacing = "0px";
    sansOmbre(ctx);
  }
  if (c.pastille) {
    ctx.font = `${COUV.pastille.taille}px "${POLICE.texte}"`;
    const l = ctx.measureText(c.pastille).width + COUV.pastille.h * 0.9 + COUV.pastille.taille * 1.1;
    pastille(ctx, c.pastille, L / 2 - l / 2, COUV.pastille.y, COUV.pastille.h, COUV.pastille.taille, true);
  }
}

// ---------------------------------------------------------------------------
// Slide d'appli
// ---------------------------------------------------------------------------

/**
 * Mesures : le nom en Inter Display Medium 128 px, approche −4 %, à x 150,
 * base 222 ; les pastilles à y 295 (60 px de haut, texte 30 px) ; trois
 * captures de 254 × 551 à x 148, 413 et 679, y 406, coins de 6 px ; la note à
 * x 147, y 977, 785 px de large, coins de 50 px : « < Notes » en 36 px à
 * x 192, base 1 043, les deux icônes à x 815 et 873 ; le texte en 30 px,
 * 36 px d'une ligne à l'autre, première base 1 105, 700 px de large.
 */
const APP = {
  nom: { x: 150, base: 222, taille: 128 },
  pastilles: { x: 148, y: 295, h: 60, taille: 30 },
  captures: { x: [148, 413, 679], y: 406, l: 254, h: 551, r: 7 },
  note: { x: 147, y: 977, l: 785, r: 50, entete: 1043, texte: 1105, pas: 36, taille: 30, largeur: 700 },
};

function iconesNotes(ctx: Ctx, base: number) {
  ctx.strokeStyle = COULEUR.notesJaune;
  ctx.lineWidth = 2.6;
  // Partager : un carré ouvert en haut et une flèche.
  const sx = 815;
  const sy = base - 30;
  ctx.beginPath();
  ctx.moveTo(sx - 10, sy + 10);
  ctx.lineTo(sx - 15, sy + 10);
  ctx.lineTo(sx - 15, sy + 40);
  ctx.lineTo(sx + 15, sy + 40);
  ctx.lineTo(sx + 15, sy + 10);
  ctx.lineTo(sx + 10, sy + 10);
  ctx.moveTo(sx, sy + 26);
  ctx.lineTo(sx, sy - 6);
  ctx.moveTo(sx - 8, sy + 2);
  ctx.lineTo(sx, sy - 6);
  ctx.lineTo(sx + 8, sy + 2);
  ctx.stroke();
  // Plus : trois points dans un rond.
  ctx.beginPath();
  ctx.arc(873, base - 13, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COULEUR.notesJaune;
  for (const dx of [-8, 0, 8]) {
    ctx.beginPath();
    ctx.arc(873 + dx, base - 13, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function appli(ctx: Ctx, post: Post, s: Slide, c: AppliSlide, langue: string) {
  const carte = post.style === "carte";
  await fond(ctx, c.fond ?? post.fond, carte ? 0.14 : 0.5);
  ombre(ctx, 26, 0.35);
  ctx.font = `${APP.nom.taille}px "${POLICE.nom}"`;
  ctx.letterSpacing = `${-0.04 * APP.nom.taille}px`;
  let t = APP.nom.taille;
  while (ctx.measureText(c.nom).width > 900 && t > 70) {
    t -= 4;
    ctx.font = `${t}px "${POLICE.nom}"`;
    ctx.letterSpacing = `${-0.04 * t}px`;
  }
  ctx.fillStyle = COULEUR.blanc;
  ctx.textAlign = "left";
  ctx.fillText(c.nom, APP.nom.x, APP.nom.base);
  ctx.letterSpacing = "0px";
  sansOmbre(ctx);
  let xp = APP.pastilles.x;
  for (const e of c.etiquettes ?? ["iOS"]) xp += pastille(ctx, e, xp, APP.pastilles.y, APP.pastilles.h, APP.pastilles.taille, false, carte ? COULEUR.rosePastille : COULEUR.jaune) + 14;

  // Les captures du magasin de la langue (images/applis/<nom>/<langue>/) quand il en a d'autres.
  const locales = (n: number) => (existsSync(join(RACINE, `${c.dossier}/${langue}/${n}.jpg`)) ? `${c.dossier}/${langue}/${n}.jpg` : `${c.dossier}/${n}.jpg`);
  // Sophia : ses captures traduites (assets/sophia/<langue>/, `npm run sophia`) quand elles existent.
  const sophia = (n: number) => (existsSync(join(RACINE, `assets/sophia/${langue}/ecran-${n}.jpg`)) ? `assets/sophia/${langue}/ecran-${n}.jpg` : `assets/sophia/ecran-${n}.jpg`);
  const captures = s.app === "sophia" ? [1, 2, 3].map(sophia) : [1, 2, 3].map(locales);
  if (s.app !== "sophia" && !c.dossier) throw new Error(`${c.nom} : pas de dossier d'appli (npm run appli -- --id <id> <nom>)`);
  for (const [i, f] of captures.entries()) {
    const { y, l, h, r } = APP.captures;
    const x = APP.captures.x[i];
    ctx.save();
    rectArrondi(ctx, x, y, l, h, r);
    ctx.clip();
    remplir(ctx, await image(f), x, y, l, h);
    ctx.restore();
  }

  const n = APP.note;
  ctx.font = `${n.taille}px "${POLICE.texte}"`;
  const lignes = couper(ctx, c.note, n.largeur);
  if (lignes.length > 4) throw new Error(`${c.nom} : la note tient sur 4 lignes au plus`);
  const hNote = n.texte - n.y + (lignes.length - 1) * n.pas + 46;
  ctx.fillStyle = COULEUR.note;
  rectArrondi(ctx, n.x, n.y, n.l, hNote, n.r);
  ctx.fill();
  ctx.strokeStyle = COULEUR.notesJaune;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(209, n.entete - 30);
  ctx.lineTo(194, n.entete - 12);
  ctx.lineTo(209, n.entete + 6);
  ctx.stroke();
  ctx.font = `36px "${POLICE.texte}"`;
  ctx.fillStyle = COULEUR.notesJaune;
  ctx.fillText("Notes", 226, n.entete);
  iconesNotes(ctx, n.entete);
  ctx.font = `${n.taille}px "${POLICE.texte}"`;
  ctx.fillStyle = COULEUR.noteTexte;
  lignes.forEach((l, i) => ctx.fillText(l, 192, n.texte + i * n.pas));
}

// ---------------------------------------------------------------------------
// Fin
// ---------------------------------------------------------------------------

/**
 * Mesures : « save & follow » en Inter Display SemiBold 120 px, approche −5 %,
 * centré sur x 565, base 615 ; la bande jaune penchée de −3°, centrée
 * (585, 690), texte 56 px ; l'appareil photo : grille de tiers, « SLO-MO VIDEO
 * PHOTO SQUARE STICKER » en 28 px à y 1 167 (PHOTO en jaune), la vignette à
 * x 130, le déclencheur centré à y 1 252, la flèche de retournement à x 950.
 */
async function fin(ctx: Ctx, post: Post, c: Fin, vignette: string) {
  await fond(ctx, post.fond, 0.42);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const x of [L / 3, (2 * L) / 3]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (const y of [345, 1005]) {
    ctx.moveTo(0, y);
    ctx.lineTo(L, y);
  }
  ctx.stroke();
  const g = ctx.createLinearGradient(0, 1020, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 1020, L, H - 1020);

  ombre(ctx, 26, 0.35);
  ctx.font = `120px "${POLICE.titre}"`;
  ctx.letterSpacing = "-6px";
  ctx.fillStyle = COULEUR.blanc;
  ctx.textAlign = "center";
  ctx.fillText(c.haut, 565, 615);
  ctx.letterSpacing = "0px";
  sansOmbre(ctx);
  ctx.save();
  ctx.translate(585, 690);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.font = `56px "${POLICE.texte}"`;
  ctx.letterSpacing = "-2px";
  const lb = ctx.measureText(c.bande).width + 30;
  ctx.fillStyle = COULEUR.jaune;
  ctx.fillRect(-lb / 2, -44, lb, 88);
  ctx.fillStyle = COULEUR.texteJaune;
  ctx.textAlign = "center";
  ctx.fillText(c.bande, 0, 18);
  ctx.restore();
  ctx.letterSpacing = "0px";

  ctx.font = `28px "${POLICE.texte}"`;
  ctx.textAlign = "center";
  for (const [t, x] of [
    ["SLO-MO", 152],
    ["VIDEO", 351],
    ["PHOTO", 540],
    ["SQUARE", 728],
    ["STICKER", 925],
  ] as const) {
    ctx.fillStyle = t === "PHOTO" ? COULEUR.photo : COULEUR.blanc;
    ctx.fillText(t, x, 1167);
  }
  ctx.save();
  rectArrondi(ctx, 98, 1218, 70, 70, 10);
  ctx.clip();
  remplir(ctx, await image(vignette), 98, 1218, 70, 70);
  ctx.restore();
  ctx.strokeStyle = COULEUR.blanc;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(540, 1253, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COULEUR.blanc;
  ctx.beginPath();
  ctx.arc(540, 1253, 28, 0, Math.PI * 2);
  ctx.fill();
  // Retourner la caméra : deux arcs fléchés.
  ctx.lineWidth = 3;
  for (const [a0, a1, sens] of [
    [Math.PI * 1.1, Math.PI * 1.9, 1],
    [Math.PI * 0.1, Math.PI * 0.9, -1],
  ] as const) {
    ctx.beginPath();
    ctx.arc(950, 1253, 16, a0, a1);
    ctx.stroke();
    const ax = 950 + 16 * Math.cos(a1);
    const ay = 1253 + 16 * Math.sin(a1);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 7 * sens, ay - 3 * sens);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + 1 * sens, ay - 8 * sens);
    ctx.stroke();
  }
}

/** Une étoile blanche à cinq branches (sa fin en style `carte`). */
function etoile(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Fin en style `carte` : la photo, des étoiles blanches, la fenêtre x 187 à
 * 892, y 654 à 1 148 ; « save & follow » en noir, 96 px, base 888 ; la bande
 * rose, base 962 ; cœur, bulle, avion et signet au trait à y 1 055.
 */
async function finCarte(ctx: Ctx, post: Post, c: Fin) {
  remplir(ctx, await image(post.fond), 0, 0, L, H);
  ctx.fillStyle = "#ffffff";
  for (const [x, y, r] of [
    [298, 160, 26],
    [858, 157, 24],
    [1000, 272, 24],
    [96, 320, 24],
    [134, 955, 24],
    [1016, 1104, 24],
    [833, 1208, 22],
  ] as const)
    etoile(ctx, x, y, r);
  fenetre(ctx, 187, 654, 705, 494);
  ctx.font = `96px "${POLICE.titre}"`;
  ctx.letterSpacing = "-5px";
  ctx.fillStyle = COULEUR.noir;
  ctx.textAlign = "center";
  if (ctx.measureText(c.haut).width > 660) throw new Error(`fin : « ${c.haut} » ne tient pas dans la fenêtre, raccourcis-le`);
  ctx.fillText(c.haut, 541, 888);
  ctx.letterSpacing = "0px";
  surligne(ctx, c.bande, 545, 962, 58, COULEUR.rose, COULEUR.roseBande, -2);
  ctx.strokeStyle = "#1c1c1c";
  ctx.lineWidth = 3.2;
  ctx.lineJoin = "round";
  const y = 1055;
  // Cœur
  ctx.beginPath();
  ctx.moveTo(419, y + 16);
  ctx.bezierCurveTo(390, y - 4, 398, y - 26, 419, y - 12);
  ctx.bezierCurveTo(440, y - 26, 448, y - 4, 419, y + 16);
  ctx.stroke();
  // Bulle
  ctx.beginPath();
  ctx.arc(502, y - 2, 19, Math.PI * 0.75, Math.PI * 2.55);
  ctx.lineTo(486, y + 18);
  ctx.closePath();
  ctx.stroke();
  // Avion en papier
  ctx.beginPath();
  ctx.moveTo(570, y - 16);
  ctx.lineTo(608, y - 20);
  ctx.lineTo(592, y + 18);
  ctx.lineTo(585, y + 1);
  ctx.closePath();
  ctx.moveTo(585, y + 1);
  ctx.lineTo(608, y - 20);
  ctx.stroke();
  // Signet
  ctx.beginPath();
  ctx.moveTo(656, y - 20);
  ctx.lineTo(684, y - 20);
  ctx.lineTo(684, y + 20);
  ctx.lineTo(670, y + 8);
  ctx.lineTo(656, y + 20);
  ctx.closePath();
  ctx.stroke();
}

/** Rend une slide en JPEG 1080 × 1350, sans métadonnées. */
export async function rendreSlide(post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, L, H);
  const c = contenu<unknown>(s, langue);
  if (!c) throw new Error(`slide ${s.type} : rien en ${langue}`);
  const style = post.style ?? "bibliotheque";
  if (s.type === "couverture") await couverture(ctx, c as Couverture, style);
  else if (s.type === "appli") await appli(ctx, post, s, c as AppliSlide, langue);
  else if (style === "carte") await finCarte(ctx, post, c as Fin);
  else {
    const couv = post.slides.find((x) => x.type === "couverture");
    const vignette = couv ? contenu<Couverture>(couv, langue).photos[0] : post.fond;
    await fin(ctx, post, c as Fin, vignette);
  }
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 93));
}
