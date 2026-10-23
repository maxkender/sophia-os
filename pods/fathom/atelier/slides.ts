// Un remake (posts/<id>.json) et le rendu de ses slides :
// - la couverture : le titre en affiche (chiffre et mots en bronze) et notre
//   statue libre de droits à la place de leur figurine ;
// - les étapes : un titre géant, puis une VRAIE vidéo YouTube, ou la carte
//   d'UnSwipe quand l'étape s'y prête ;
// - la slide de l'appli Sophia, à la place de leur slide Fathomly.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COULEUR, type Ctx, H, icone, L, type LigneTitre, lignesCentrees, mesurerTitre, titreAffiche, titreGeant } from "./dessin.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import { POLICE } from "./polices.ts";
import { carteYoutube, hauteurCarte, type Video } from "./youtube.ts";

export const RACINE = join(import.meta.dirname, "..");

/** Nos deux applis : leur icône (App Store, 1 024 px) et la couleur de leur nom sur une carte. */
export const APPLIS = {
  sophia: { icone: "assets/applis/sophia.jpg", couleur: "#e07aa6" },
  unswipe: { icone: "assets/applis/unswipe.jpg", couleur: "#5b6cf0" },
} as const;
export type Appli = keyof typeof APPLIS;

export type ContenuCouverture = { lignes: LigneTitre[] };
/** La carte d'une appli dans une étape (comme les cartes de ses posts « 5 apps »). */
export type CarteAppli = { nom: string; texte: string[] };
export type ContenuEtape = {
  /** Le titre géant, une entrée par ligne. */
  titre: LigneTitre[];
  /**
   * Titre « en affiche », comme ses « 10/10 Skills » : chaque ligne remplit
   * seule la largeur, sous sa hauteur de capitale maximale (une entrée par
   * ligne ; une petite valeur fait la ligne d'appoint, « HOW TO »).
   */
  tailles?: number[];
  /** La vraie vidéo YouTube (`npm run youtube`)… */
  video?: Video;
  /** … ou la carte de l'appli de l'étape (`app` de la slide). */
  carte?: CarteAppli;
  /** La ligne sous la carte, comme les siennes (« 2–3 hours to learn. », « reason clearly, argue well… »). */
  sous?: string[];
};
/** La slide de l'appli (Sophia) : son nom, la ligne en dessous, l'icône et sa phrase. */
export type ContenuApp = { nom: string; sous: string; texte: string[] };

export type Slide = {
  type: "couverture" | "etape" | "app";
  /** L'appli montrée : `sophia` sur LA slide de l'appli (une seule), `unswipe` sur une étape. */
  app?: Appli;
  /** La statue de la couverture (chemin depuis le dossier du pod). */
  statue?: string;
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

/** La slide de l'appli Sophia : celle que l'OS marque `position_sophia`. */
export const estSlideSophia = (s: Slide) => s.type === "app" && s.app === "sophia";

/**
 * Les zones que TikTok couvre sur un diaporama : les onglets en haut, la
 * légende en bas. La couverture garde son titre et le corps de la statue
 * entre les deux.
 */
const HAUT_LIBRE = 250;
const BAS_LIBRE = H - 170;

async function couverture(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, s: Slide, c: ContenuCouverture) {
  const bas = titreAffiche(ctx, c.lignes, { y: HAUT_LIBRE, largeur: 960, capMax: 236, interligne: 0.14 });
  if (!s.statue) return;
  const img = await loadImage(join(RACINE, s.statue));
  const hDispo = BAS_LIBRE - bas - 80;
  const k = Math.min(hDispo / img.height, 900 / img.width);
  const l = img.width * k;
  const h = img.height * k;
  const x = (L - l) / 2;
  const y = BAS_LIBRE - h;
  // Une ombre douce sous le socle, pour poser la statue sur le blanc.
  ctx.save();
  const g = ctx.createRadialGradient(L / 2, y + h - 6, 10, L / 2, y + h - 6, l * 0.55);
  g.addColorStop(0, "rgba(0,0,0,0.20)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.scale(1, 0.12);
  ctx.fillRect(0, (y + h - 6) / 0.12 - l * 0.55, L, l * 1.1);
  ctx.restore();
  ctx.drawImage(img, x, y, l, h);
}

/** La ligne sous la carte (« 2–3 hours to learn. ») : Inter SemiBold 54 px, 74 px sous la carte, relevée sur ses slides. */
const SOUS = { taille: 54, pas: 70, ecart: 74 };

/** Hauteur de la carte d'une appli : icône, nom, puis ses lignes de texte. */
const hauteurCarteAppli = (c: CarteAppli) => 380 + 64 + 118 + 50 + c.texte.length * 72;

/**
 * Le titre « en affiche » d'une étape (relevé sur ses « 10/10 Skills », 23/10) :
 * chaque ligne occupe 920 px au plus sous sa hauteur de capitale, 20 px entre
 * deux lignes. Sans `dessiner`, mesure seulement.
 */
function titreParLignes(ctx: Ctx, c: ContenuEtape, y: number, dessiner: boolean): number {
  let haut = y;
  c.titre.forEach((ligne, i) => {
    const o = { largeur: 920, capMax: c.tailles![i] ?? 180 };
    const cap = dessiner ? titreGeant(ctx, [ligne], { ...o, y: haut }).cap : mesurerTitre(ctx, [ligne], o).cap;
    haut += cap + 20;
  });
  return haut - 20;
}

async function etape(ctx: Ctx, s: Slide, c: ContenuEtape) {
  const optTitre = { largeur: 1040, capMax: 346 };
  const affiche = !!c.tailles?.length;
  const hTitre = affiche ? titreParLignes(ctx, c, 0, false) : mesurerTitre(ctx, c.titre, optTitre).hauteur;
  // Ses « 10/10 Skills » laissent 82 px entre le titre et la carte.
  const ecart = c.carte ? 70 : affiche ? 82 : 17;
  const hCarte = c.carte ? hauteurCarteAppli(c.carte) : hauteurCarte;
  const hSous = c.sous?.length ? SOUS.ecart + c.sous.length * SOUS.pas : 0;
  const y0 = Math.round((H - (hTitre + ecart + hCarte + hSous)) / 2 + 24);
  const bas = affiche ? titreParLignes(ctx, c, y0, true) : titreGeant(ctx, c.titre, { ...optTitre, y: y0 }).bas;
  const yCarte = bas + ecart;
  if (c.video) {
    const bas = await carteYoutube(ctx, c.video, yCarte);
    if (c.sous?.length) lignesCentrees(ctx, c.sous, { y: bas + SOUS.ecart + 44, police: POLICE.sous, taille: SOUS.taille, pas: SOUS.pas, couleur: COULEUR.texte, largeurMax: 980 });
    return;
  }
  if (!c.carte || !s.app) throw new Error("une étape montre une vidéo YouTube ou la carte de son appli (`app`)");
  const appli = APPLIS[s.app];
  icone(ctx, await loadImage(join(RACINE, appli.icone)), (L - 380) / 2, yCarte, 380);
  const n = titreGeant(ctx, [[{ t: c.carte.nom, couleur: appli.couleur }]], { y: yCarte + 380 + 64, largeur: 900, capMax: 118 });
  lignesCentrees(ctx, c.carte.texte, { y: n.bas + 50 + 54, police: POLICE.texte, taille: 54, pas: 72, couleur: COULEUR.texte, largeurMax: 980 });
}

async function app(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, s: Slide, c: ContenuApp) {
  if (!s.app) throw new Error("la slide de l'appli dit laquelle (`app`)");
  // Leur slide Fathomly : nom (cap 214), ligne (cap 100), icône 493 px, phrase en 67 px.
  const hBloc = 214 + 34 + 100 + 66 + 493 + 76 + c.texte.length * 80;
  const y0 = Math.round((H - hBloc) / 2 - 20);
  const nom = titreGeant(ctx, [c.nom], { y: y0, largeur: 840, capMax: 214 });
  const sous = titreGeant(ctx, [c.sous], { y: nom.bas + 34, largeur: 840, capMax: 100 });
  const yIcone = sous.bas + 66;
  icone(ctx, await loadImage(join(RACINE, APPLIS[s.app].icone)), (L - 493) / 2, yIcone, 493);
  lignesCentrees(ctx, c.texte, { y: yIcone + 493 + 76 + 52, police: POLICE.texte, taille: 66, pas: 80, couleur: COULEUR.texte, largeurMax: 980 });
}

/** Rend une slide en JPEG 1080 × 1920, sans métadonnées. */
export async function rendreSlide(_post: Post, s: Slide, langue: string): Promise<Buffer> {
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = s.type === "app" ? COULEUR.fondApp : COULEUR.fond;
  ctx.fillRect(0, 0, L, H);
  const c = contenu<unknown>(s, langue);
  if (!c) throw new Error(`slide ${s.type} : rien en ${langue}`);
  if (s.type === "couverture") await couverture(ctx, s, c as ContenuCouverture);
  else if (s.type === "etape") await etape(ctx, s, c as ContenuEtape);
  else await app(ctx, s, c as ContenuApp);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 93));
}
