// Un remake (posts/<id>.json) et le rendu de ses slides, au style de @kaja.learn :
// - la couverture : notre décor (la mascotte Sophia en pâte à modeler, à la
//   place de son corbeau) et le titre en affiche à gauche, « 10/10 » en
//   sarcelle puis ses lignes en noir ;
// - les étapes : le titre en haut (« HOW TO » en noir, la compétence en
//   couleur), une VRAIE vidéo YouTube en carte pleine largeur, puis le temps
//   qu'il faut (« 10-30 min ») ;
// - l'étape Sophia : la carte de l'appli à la place de la vidéo, au milieu de
//   la liste. Sa slide d'appli de fin disparaît (décision d'Adrien du 4/11,
//   comme au podz 11 le 23/10).

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COULEUR, type Ctx, depassements, H, icone, imageRemplie, L, type LigneTitre, lignesCentrees, mesurerTitre, titreGeant } from "./dessin.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";
import { carteYoutube, hauteurCarte, type Video } from "./youtube.ts";

export const RACINE = join(import.meta.dirname, "..");

/** Notre appli : son icône (App Store, 1 024 px) et la couleur de son nom sur la carte. */
export const APPLIS = {
  sophia: { icone: "assets/applis/sophia.jpg", couleur: "#e07aa6" },
} as const;
export type Appli = keyof typeof APPLIS;

/**
 * Un décor de couverture : l'image 1080 × 1920 (générée le 4/11 avec la
 * mascotte `assets/mascotte.jpg`) et la zone du titre, mesurée sur l'image.
 * Chaque ligne du titre remplit `largeur` depuis `x`, sous `capMax`.
 */
export type Decor = {
  image: string;
  x: number;
  largeur: number;
  /** Haut des capitales du « 10/10 » quand le décor ne le porte pas. */
  y?: number;
  /** Le décor porte déjà le « 10/10 », sculpté : les lignes partent sous son bas. */
  chiffreSculpte?: { bas: number };
  capMax: number;
  /** Le bas que le titre ne dépasse pas (au-dessus de la légende de TikTok). */
  basMax: number;
};

export const DECORS: Record<string, Decor> = {
  /** La mascotte tire, du haut de la falaise, la corde nouée au « 10/10 » sculpté (sa couverture à 2,9 M). */
  falaise: { image: "assets/couvertures/falaise.jpg", x: 100, largeur: 501, chiffreSculpte: { bas: 996 }, capMax: 230, basMax: 1700 },
  /** La mascotte pendue à la branche, les deux ailes dessus (sa couverture à 1,2 M) : tout le titre à gauche. */
  branche: { image: "assets/couvertures/branche.jpg", x: 64, largeur: 380, y: 640, capMax: 230, basMax: 1700 },
  /** La même, pendue d'une aile. */
  branche2: { image: "assets/couvertures/branche2.jpg", x: 64, largeur: 395, y: 640, capMax: 230, basMax: 1700 },
};

/** La couverture : `chiffre` (« 10/10 » par défaut), puis les lignes en noir (« SKILLS », « YOU CAN », « LEARN »). */
export type ContenuCouverture = { chiffre?: string; lignes: LigneTitre[] };
/** La carte d'une appli dans une étape. */
export type CarteAppli = { nom: string; texte: string[] };
export type ContenuEtape = {
  /** Le titre, une entrée par ligne : `"HOW TO"`, puis `[{ "t": "SMALL TALK", "couleur": "#e96dad" }]`. */
  titre: LigneTitre[];
  /** La capitale maximale de chaque ligne (346 par défaut : un mot court grossit, comme son « RIZZ »). */
  tailles?: number[];
  /** La vraie vidéo YouTube (`npm run youtube`)… */
  video?: Video;
  /** … ou la carte de l'appli de l'étape (`app` de la slide). */
  carte?: CarteAppli;
  /** Le temps qu'il faut, sous la carte (« 10-30 min », « 1-2 weeks »). Facultatif, comme chez lui. */
  sous?: string[];
};

export type Slide = {
  type: "couverture" | "etape";
  /** `sophia` sur LA slide de l'appli (une seule, une étape). */
  app?: Appli;
  /** Le décor de la couverture (`DECORS`). */
  decor?: string;
  [langue: string]: unknown;
};

export type Post = {
  id: string;
  /** Le post refait : url, vues, date, accroche. */
  source: { url: string; vues: number; publie_le?: string; accroche: string };
  /** L'accroche, lue par l'OS comme le hook. */
  titre: Record<string, string>;
  /** La légende TikTok, 3 ou 4 hashtags. */
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  slides: Slide[];
};

export function lirePost(id: string): Post {
  return JSON.parse(readFileSync(join(RACINE, "posts", `${id}.json`), "utf8")) as Post;
}

export function contenu<T>(s: Slide, langue: string): T {
  return s[langue] as T;
}

/** Les langues où le titre, la légende et chaque slide sont écrits. */
export function languesCompletes(post: Post): string[] {
  return Object.keys(post.titre).filter((l) => post.legendes[l] && post.slides.every((s) => s[l]));
}

/** La slide Sophia, que l'OS marque `position_sophia` : une étape avec la carte Sophia. */
export const estSlideSophia = (s: Slide) => s.app === "sophia" && s.type === "etape";

// ---------------------------------------------------------------------------
// La couverture
// ---------------------------------------------------------------------------

async function couverture(ctx: Ctx, s: Slide, c: ContenuCouverture) {
  const d = DECORS[s.decor ?? ""];
  if (!d) throw new Error(`couverture : décor inconnu « ${s.decor} » (${Object.keys(DECORS).join(", ")})`);
  imageRemplie(ctx, await loadImage(join(RACINE, d.image)), 0, 0, L, H);
  const lignes: LigneTitre[] = d.chiffreSculpte ? c.lignes : [[{ t: c.chiffre ?? "10/10", couleur: COULEUR.sarcelle }], ...c.lignes];
  const o = { largeur: d.largeur, capMax: d.capMax, aligne: "gauche" as const, x: d.x, espacement: 0 };
  // Relevé sur ses couvertures : 13 % de la capitale entre deux lignes.
  let y = d.chiffreSculpte ? d.chiffreSculpte.bas + 28 : (d.y ?? 640);
  let bas = y;
  for (const [i, ligne] of lignes.entries()) {
    // Les accents d'une ligne (« SOCIÉTÉ ») gardent leur place sous la ligne d'avant.
    if (i > 0) y += depassements(ctx, ligne, mesurerTitre(ctx, [ligne], o).taille).haut;
    const r = titreGeant(ctx, [ligne], { ...o, y });
    bas = r.bas;
    y = r.bas + r.cap * 0.13;
  }
  if (bas > d.basMax) throw new Error(`couverture : le titre descend à y ${Math.round(bas)} (au plus ${d.basMax}) : raccourcis une ligne ou coupe-la en deux`);
}

// ---------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------

/**
 * Le titre d'une étape (relevé sur ses slides du 4/11) : chaque ligne remplit
 * 800 px au plus, sous sa capitale maximale (346 par défaut, comme son
 * « RIZZ »), 16 px entre deux lignes. Sans `dessiner`, mesure seulement.
 */
const TITRE = { largeur: 800, capMax: 346, ecart: 16 };

function titreEtape(ctx: Ctx, c: ContenuEtape, y: number, dessiner: boolean): number {
  let haut = y;
  for (const [i, ligne] of c.titre.entries()) {
    const o = { largeur: TITRE.largeur, capMax: c.tailles?.[i] ?? TITRE.capMax };
    const m = mesurerTitre(ctx, [ligne], o);
    if (i > 0) haut += depassements(ctx, ligne, m.taille).haut;
    if (dessiner) titreGeant(ctx, [ligne], { ...o, y: haut });
    haut += m.hauteur + TITRE.ecart;
  }
  return haut - TITRE.ecart;
}

/**
 * La mise en page d'une étape : le bloc (titre, carte, temps) centré un peu
 * au-dessus du milieu (vers y 880), comme les siens : 130 px entre le titre et
 * la carte, la ligne du temps 125 px sous la méta de la vidéo.
 */
const BLOC = { centre: 880, hautMin: 110, ecartCarte: 130, ecartSous: 125 };
/** La ligne du temps : Inter SemiBold 58 px (capitale ≈ 42 px), centrée. */
const SOUS = { taille: 58, cap: 42, pas: 74 };

/** Hauteur de la carte d'une appli : icône, nom, puis ses lignes de texte. */
const hauteurCarteAppli = (c: CarteAppli) => 380 + 64 + 118 + 50 + c.texte.length * 72;

async function etape(ctx: Ctx, s: Slide, c: ContenuEtape) {
  if (!c.video && !(c.carte && s.app)) throw new Error("une étape montre une vraie vidéo YouTube ou la carte de son appli (`app`)");
  const hTitre = titreEtape(ctx, c, 0, false);
  const hCarte = c.video ? hauteurCarte : hauteurCarteAppli(c.carte!);
  const hSous = c.sous?.length ? BLOC.ecartSous + SOUS.cap + (c.sous.length - 1) * SOUS.pas : 0;
  const total = hTitre + BLOC.ecartCarte + hCarte + hSous;
  const y0 = Math.max(BLOC.hautMin, Math.round(BLOC.centre - total / 2));
  const yCarte = titreEtape(ctx, c, y0, true) + BLOC.ecartCarte;
  let basCarte: number;
  if (c.video) basCarte = await carteYoutube(ctx, c.video, yCarte);
  else {
    const appli = APPLIS[s.app!];
    icone(ctx, await loadImage(join(RACINE, appli.icone)), (L - 380) / 2, yCarte, 380);
    const n = titreGeant(ctx, [[{ t: c.carte!.nom, couleur: appli.couleur }]], { y: yCarte + 380 + 64, largeur: 900, capMax: 118 });
    basCarte = lignesCentrees(ctx, c.carte!.texte, { y: n.bas + 50 + 54, police: POLICE.texte, taille: 54, pas: 72, couleur: COULEUR.texte, largeurMax: 980 }) + 18;
  }
  if (c.sous?.length) {
    lignesCentrees(ctx, c.sous, { y: basCarte + BLOC.ecartSous + SOUS.cap, police: POLICE.sous, taille: SOUS.taille, pas: SOUS.pas, couleur: COULEUR.texte, largeurMax: 980 });
  }
}

/** Rend une slide en JPEG 1080 × 1920, sans métadonnées. */
export async function rendreSlide(_post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = s.type === "couverture" ? COULEUR.fondCouverture : COULEUR.fond;
  ctx.fillRect(0, 0, L, H);
  const c = contenu<unknown>(s, langue);
  if (!c) throw new Error(`slide ${s.type} : rien en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as ContenuCouverture);
  else await etape(ctx, s, c as ContenuEtape);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 93));
}
