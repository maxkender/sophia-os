// Le rendu des slides du podz 24, au style exact de @thebiomechanic (mesuré
// sur ses slides de 1080 × 1350, relevé du 20/11) :
// - la couverture : une petite tête au cerveau lumineux en haut, « Morning
//   Tierlist / For Optimal Health » en Playfair Display (le mot entre * en
//   vert gras, celui entre ~ en rouge), « (Science based) », un croquis à
//   l'encre noire, et la jauge « CORTISOL » (dessinée ici) ;
// - un tier : « S TIER » en grand, le nom de l'élément, deux courts
//   paragraphes en Playfair gras centrés, une photo de la banque de l'OS ;
// - la slide Atala : un tier comme les autres (le tier « courir »), sa photo
//   de course de la banque et le logo d'Atala à côté.
// Le bloc (tier, nom, texte, photo) est centré en hauteur ; la photo prend la
// place qui reste (420 px de haut au plus) : un texte trop long qui ne lui en
// laisse plus assez est refusé.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";

export const RACINE = join(import.meta.dirname, "..");
export const L = 1080;
export const H = 1350;

export const COULEUR = {
  fond: "#ffffff",
  texte: "#000000",
  /** « Optimal » sur sa couverture. */
  vert: "#00c060",
  /** « Job » sur sa couverture « Job Tierlist ». */
  rouge: "#e8343a",
  /** La jauge : aiguille, LOW / MEDIUM / HIGH, CORTISOL. */
  marine: "#24385a",
  jauge: ["#5bb847", "#a9c63d", "#f1d93b", "#f5a03a", "#f2643f", "#e5273d"],
} as const;

const ICONE_ATALA = "assets/atala/icone.png";

export type TypeSlide = "couverture" | "tier" | "atala";
export type Cadrage = { x?: number; y?: number };
export type Slide = {
  type: TypeSlide;
  /** Une photo de la banque (images/banque/…) : un tier, la slide Atala. */
  photo?: string;
  /** Le cadre de la photo, recadrée dedans : `paysage` (3:2, le sien, par défaut), `carre`, `portrait` (4:5). */
  format?: "paysage" | "carre" | "portrait";
  /** Où recadrer (0..1, 0,5 au centre) : `y` 0,3 garde le haut d'une photo en hauteur. */
  cadrage?: Cadrage;
  /** La couverture : la tête au cerveau (images/dessins/…png) et le croquis (images/dessins/…jpg). */
  icone?: string;
  dessin?: string;
  [langue: string]: unknown;
};

/** `lignes` : deux lignes ; *mot* en vert gras, ~mot~ en rouge. */
export type TexteCouverture = { lignes: [string, string]; note: string };
/** `tier` : S, A, B, C, D ou F. */
export type TexteTier = { tier: string; nom: string; paragraphes: string[] };

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
export const photosSlide = (s: Slide): string[] => (s.photo ? [s.photo] : []);

const sansMarques = (t: string) => t.replace(/[*~]/g, "");
export function textesSlide(s: Slide, langue: string): string {
  const c = contenu<Record<string, unknown>>(s, langue);
  if (s.type === "couverture") {
    const t = c as TexteCouverture;
    return sansMarques(`${t.lignes.join(" ")} ${t.note}`);
  }
  const t = c as TexteTier;
  return [`${t.tier} TIER`, t.nom, ...t.paragraphes].join(" — ");
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

/** La boîte remplie par l'image (recadrée selon `cadrage`, au centre par défaut). */
function remplir(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number, cadrage: Cadrage = {}) {
  const k = Math.max(l / img.width, h / img.height);
  const lw = l / k;
  const hh = h / k;
  const borne = (v: number | undefined) => Math.min(1, Math.max(0, v ?? 0.5));
  ctx.drawImage(img, (img.width - lw) * borne(cadrage.x), (img.height - hh) * borne(cadrage.y), lw, hh, x, y, l, h);
}

const RATIOS = { paysage: 3 / 2, carre: 1, portrait: 4 / 5 } as const;

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
  let cur = "";
  for (const m of t.split(/\s+/).filter(Boolean)) {
    const essai = cur ? `${cur} ${m}` : m;
    if (cur && ctx.measureText(essai).width > largeur) {
      lignes.push(cur);
      cur = m;
    } else cur = essai;
  }
  if (cur) lignes.push(cur);
  return lignes;
}

// --- Un tier ------------------------------------------------------------------

/** Ses mesures (« S TIER / Zone 2 Trail Running ») : tier 110 px (capitales de 78 px),
 * nom 66 px 102 px plus bas, texte gras 35 px tous les 52 px sur 850 px au plus,
 * une ligne vide entre les paragraphes, la photo 34 px sous le texte. */
const TIER = {
  tier: { taille: 110, cap: 78 },
  nom: { taille: 66, ecart: 102, pas: 76, largeur: 940 },
  texte: { taille: 35, ecart: 84, pas: 52, largeur: 850 },
  photo: { ecart: 34, largeur: 600, hauteur: 420, min: 230 },
  marges: { haut: 70, bas: 64 },
  atala: { logo: 165, ecart: 34, largeurPhoto: 470 },
} as const;

async function tier(ctx: Ctx, s: Slide, c: TexteTier, avecAtala: boolean) {
  if (!/^[SABCDF]$/.test(c.tier)) throw new Error(`tier inconnu : « ${c.tier} » (S, A, B, C, D ou F)`);
  if (!s.photo) throw new Error(`« ${c.nom} » : pas de photo (images/banque/…)`);
  ctx.textAlign = "center";
  ctx.fillStyle = COULEUR.texte;
  ctx.font = `${TIER.nom.taille}px "${POLICE.gras}"`;
  const nom = couper(ctx, c.nom, TIER.nom.largeur);
  if (nom.length > 2) throw new Error(`« ${c.nom} » : le nom tient en deux lignes au plus`);
  ctx.font = `${TIER.texte.taille}px "${POLICE.gras}"`;
  const paras = c.paragraphes.map((p) => couper(ctx, p, TIER.texte.largeur));
  const lignesTexte = paras.reduce((n, p) => n + p.length, 0) + (paras.length - 1);

  // Hauteur du bloc sans la photo : du haut des capitales du tier à la photo.
  const avantPhoto =
    TIER.tier.cap + TIER.nom.ecart + (nom.length - 1) * TIER.nom.pas + TIER.texte.ecart + (lignesTexte - 1) * TIER.texte.pas + TIER.photo.ecart;
  const img = await image(s.photo);
  const ratio = RATIOS[s.format ?? "paysage"];
  if (!ratio) throw new Error(`« ${c.nom} » : format inconnu (paysage, carre, portrait)`);
  const place = H - TIER.marges.haut - TIER.marges.bas - avantPhoto;
  const largeurMax = avecAtala ? TIER.atala.largeurPhoto : TIER.photo.largeur;
  let ph = Math.min(TIER.photo.hauteur, place, largeurMax / ratio);
  if (ph < TIER.photo.min) throw new Error(`« ${c.nom} » : texte trop long, la photo n'a plus que ${Math.round(ph)} px de haut (raccourcis)`);
  const pl = ph * ratio;
  const total = avantPhoto + ph;
  const haut = Math.max(TIER.marges.haut, (H - total) / 2);

  let y = haut + TIER.tier.cap;
  ctx.font = `${TIER.tier.taille}px "${POLICE.gras}"`;
  ctx.fillText(`${c.tier} TIER`, L / 2, y);
  y += TIER.nom.ecart;
  ctx.font = `${TIER.nom.taille}px "${POLICE.gras}"`;
  for (const [i, l] of nom.entries()) ctx.fillText(l, L / 2, y + i * TIER.nom.pas);
  y += (nom.length - 1) * TIER.nom.pas + TIER.texte.ecart;
  ctx.font = `${TIER.texte.taille}px "${POLICE.gras}"`;
  for (const [k, p] of paras.entries()) {
    for (const l of p) {
      ctx.fillText(l, L / 2, y);
      y += TIER.texte.pas;
    }
    if (k < paras.length - 1) y += TIER.texte.pas;
  }
  y += TIER.photo.ecart - TIER.texte.pas;

  if (!avecAtala) {
    remplir(ctx, img, (L - pl) / 2, y, pl, ph, s.cadrage);
    return;
  }
  // La slide Atala : la photo de course, et le logo d'Atala à sa droite, centré sur elle.
  const a = TIER.atala;
  const groupe = pl + a.ecart + a.logo;
  const xp = (L - groupe) / 2;
  remplir(ctx, img, xp, y, pl, ph, s.cadrage);
  const xl = xp + pl + a.ecart;
  const yl = y + (ph - a.logo) / 2;
  const logo = await image(ICONE_ATALA);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  rectArrondi(ctx, xl, yl, a.logo, a.logo, a.logo * 0.2237);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  rectArrondi(ctx, xl, yl, a.logo, a.logo, a.logo * 0.2237);
  ctx.clip();
  ctx.drawImage(logo, xl, yl, a.logo, a.logo);
  ctx.restore();
}

// --- La couverture -----------------------------------------------------------------

/** Ses mesures : la tête de 132 px en haut (y 50) ; le titre en Playfair Regular
 * 106 px, lignes à y 304 et 433 ; « (Science based) » 54 px à y 529 ; le croquis
 * dans 660 × 385 sous y 573 ; la jauge de centre (540, 1217), rayon 184, épaisseur
 * 60 ; « CORTISOL » en linéale grasse 50 px à y 1291. */
const COUV = {
  icone: { y: 50, h: 132 },
  titre: { taille: 106, bases: [304, 433], largeur: 1000 },
  note: { taille: 54, base: 529 },
  dessin: { y: 573, l: 660, h: 385 },
  jauge: { cx: 540, cy: 1217, r: 184, ep: 60, deborde: 0.253, aiguille: -0.22, longueur: 150 },
  cortisol: { taille: 50, base: 1291 },
} as const;

type Morceau = { t: string; couleur: string; gras: boolean };
function morceaux(ligne: string): Morceau[] {
  const out: Morceau[] = [];
  for (const m of ligne.split(/(\*[^*]+\*|~[^~]+~)/).filter(Boolean)) {
    if (m.startsWith("*")) out.push({ t: m.slice(1, -1), couleur: COULEUR.vert, gras: true });
    else if (m.startsWith("~")) out.push({ t: m.slice(1, -1), couleur: COULEUR.rouge, gras: false });
    else out.push({ t: m, couleur: COULEUR.texte, gras: false });
  }
  return out;
}

/** Les mots de la jauge dans chaque langue (« CORTISOL » et LOW / MEDIUM / HIGH chez lui). */
const JAUGE: Record<string, { bas: string; moyen: string; haut: string; titre: string }> = {
  en: { bas: "LOW", moyen: "MEDIUM", haut: "HIGH", titre: "CORTISOL" },
  it: { bas: "BASSO", moyen: "MEDIO", haut: "ALTO", titre: "CORTISOLO" },
  hu: { bas: "ALACSONY", moyen: "KÖZEPES", haut: "MAGAS", titre: "KORTIZOL" },
  sr: { bas: "NIZAK", moyen: "SREDNJI", haut: "VISOK", titre: "KORTIZOL" },
};

function jauge(ctx: Ctx, langue: string) {
  const mots = JAUGE[langue] ?? JAUGE.en;
  const j = COUV.jauge;
  const debut = Math.PI - j.deborde;
  const fin = 2 * Math.PI + j.deborde;
  const pas = (fin - debut) / COULEUR.jauge.length;
  for (const [i, couleur] of COULEUR.jauge.entries()) {
    ctx.beginPath();
    ctx.arc(j.cx, j.cy, j.r, debut + i * pas, debut + (i + 1) * pas);
    ctx.arc(j.cx, j.cy, j.r - j.ep, debut + (i + 1) * pas, debut + i * pas, true);
    ctx.closePath();
    ctx.fillStyle = couleur;
    ctx.fill();
    // Le filet blanc entre deux couleurs.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // LOW, MEDIUM, HIGH le long de l'arc, tournés comme chez lui.
  ctx.fillStyle = COULEUR.marine;
  ctx.font = `25px "${POLICE.jauge}"`;
  ctx.textAlign = "center";
  const etiquette = (t: string, angle: number) => {
    const rr = j.r + 22;
    ctx.save();
    ctx.translate(j.cx + Math.cos(angle) * rr, j.cy + Math.sin(angle) * rr);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(t, 0, 9);
    ctx.restore();
  };
  etiquette(mots.bas, debut + 0.32);
  etiquette(mots.moyen, (3 * Math.PI) / 2 - 0.12);
  etiquette(mots.haut, fin - 0.32);
  // L'aiguille, dans le rouge.
  const a = j.aiguille;
  const bout = { x: j.cx + Math.cos(a) * j.longueur, y: j.cy + Math.sin(a) * j.longueur };
  const n = { x: -Math.sin(a), y: Math.cos(a) };
  ctx.beginPath();
  ctx.moveTo(j.cx + n.x * 7, j.cy + n.y * 7);
  ctx.lineTo(bout.x, bout.y);
  ctx.lineTo(j.cx - n.x * 7, j.cy - n.y * 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(j.cx, j.cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${COUV.cortisol.taille}px "${POLICE.jauge}"`;
  ctx.fillText(mots.titre, L / 2, COUV.cortisol.base);
}

async function couverture(ctx: Ctx, s: Slide, c: TexteCouverture, langue: string) {
  if (s.icone) {
    const im = await image(s.icone);
    const h = COUV.icone.h;
    const l = (h * im.width) / im.height;
    ctx.drawImage(im, (L - l) / 2, COUV.icone.y, l, h);
  }
  ctx.textAlign = "left";
  for (const [i, ligne] of c.lignes.entries()) {
    const ms = morceaux(ligne);
    const police = (m: Morceau) => `${COUV.titre.taille}px "${m.gras ? POLICE.gras : POLICE.fin}"`;
    const largeur = ms.reduce((w, m) => ((ctx.font = police(m)), w + ctx.measureText(m.t).width), 0);
    if (largeur > COUV.titre.largeur) throw new Error(`couverture : « ${sansMarques(ligne)} » trop long (${Math.round(largeur)} px)`);
    let x = (L - largeur) / 2;
    for (const m of ms) {
      ctx.font = police(m);
      ctx.fillStyle = m.couleur;
      ctx.fillText(m.t, x, COUV.titre.bases[i]);
      x += ctx.measureText(m.t).width;
    }
  }
  ctx.textAlign = "center";
  ctx.fillStyle = COULEUR.texte;
  ctx.font = `${COUV.note.taille}px "${POLICE.fin}"`;
  ctx.fillText(c.note, L / 2, COUV.note.base);
  if (s.dessin) {
    const im = await image(s.dessin);
    const k = Math.min(COUV.dessin.l / im.width, COUV.dessin.h / im.height);
    ctx.drawImage(im, (L - im.width * k) / 2, COUV.dessin.y + (COUV.dessin.h - im.height * k) / 2, im.width * k, im.height * k);
  }
  jauge(ctx, langue);
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
  if (s.type === "couverture") await couverture(ctx, s, c as TexteCouverture, langue);
  else if (s.type === "tier") await tier(ctx, s, c as TexteTier, false);
  else if (s.type === "atala") await tier(ctx, s, c as TexteTier, true);
  else throw new Error(`type de slide inconnu : ${s.type}`);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 92));
}
