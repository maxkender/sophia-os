// Un remake (posts/<id>.json) et le rendu de ses slides, au style de @sagace.fr :
// - la couverture : SON décor à l'identique (la falaise en pâte à modeler, le
//   philosophe qui tire la corde nouée au « 10/10 » sculpté, texte et @sagace
//   effacés, assets/couverture.jpg), puis ses lignes centrées à gauche de la
//   falaise, chacune à sa taille, en brun ou en noir (« COMPÉTENCE » brun,
//   « À APPRENDRE » noir, « AVANT » brun géant, « 20 ANS » noir) ;
// - les étapes : le titre en deux lignes, l'une en noir, l'autre dans une
//   couleur prise dans la miniature (« GÉRER » doré / « SON ARGENT »), une
//   VRAIE vidéo YouTube en carte sombre de l'appli, puis le temps qu'il faut
//   (« 1 heure pour apprendre ») ;
// - l'étape Sophia : la carte de l'appli (sur le noir et dans le cadre d'une
//   carte YouTube) à la place de la vidéo, au milieu de la liste. Sa slide
//   « ABONNE-TOI » (en fin ou au milieu) et ses « e-books » disparaissent.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COULEUR, type Ctx, depassements, H, icone, imageRemplie, L, type LigneTitre, lignesCentrees, mesurerTitre, titreGeant } from "./dessin.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import { choisirPoliceTitre, POLICE, policeTitre } from "./polices.ts";
import { CARTE, carteYoutube, hauteurCarte, type Video } from "./youtube.ts";

export const RACINE = join(import.meta.dirname, "..");

/** Notre appli : son icône (App Store, 1 024 px) et la couleur de son nom sur la carte. */
export const APPLIS = {
  sophia: { icone: "assets/applis/sophia.jpg", couleur: "#e07aa6" },
} as const;
export type Appli = keyof typeof APPLIS;

/**
 * Le décor de la couverture : son image, refaite le 15/11 à partir de huit de
 * ses couvertures (même illustration, textes différents : on garde ce qu'elles
 * ont en commun), en 1 080 × 1 920. Ses lignes sont centrées sur x 504 (la
 * falaise borde la droite, vers x 850 à 930), la première sous le « 10/10 »
 * (haut des capitales à y 745), 23 px entre les capitales de deux lignes :
 * l'accent d'un « À » loge dans l'écart, un plus grand l'élargit.
 */
export const DECOR = { image: "assets/couverture.jpg", centre: 504, largeur: 800, haut: 745, ecart: 23, basMax: 1700 };

/** Une ligne de couverture : `"20 ANS"` (noir) ou `{ "t": "AVANT", "couleur": "brun", "cap": 282 }`. */
export type LigneCouverture = string | { t: string; couleur?: "brun" | "noir" | string; cap?: number };
/** La couverture : ses lignes sous le « 10/10 » du décor. */
export type ContenuCouverture = { lignes: LigneCouverture[] };
/**
 * Tailles par défaut d'une ligne de couverture (hauteur de capitale maximale,
 * la ligne rapetisse si elle dépasse 800 px) : brune, elle remplit la largeur ;
 * noire, elle reste plus petite. Recopie SES tailles avec `cap`, mesurées sur
 * sa couverture (à 1 080 de large) : « COMPÉTENCE » 144, « À APPRENDRE » 93,
 * « AVANT » 283, « 20 ANS » 169 (son post à 482 k).
 */
const CAP_COUVERTURE = { brun: 285, noir: 120 };

/** La carte d'une appli dans une étape. */
export type CarteAppli = { nom: string; texte: string[] };
export type ContenuEtape = {
  /** Le titre, une entrée par ligne : `[{ "t": "GÉRER", "couleur": "#d0a239" }]`, puis `"SON ARGENT"`. */
  titre: LigneTitre[];
  /** La capitale maximale de chaque ligne (par défaut 220 pour la ligne en couleur, 146 pour la noire). */
  tailles?: number[];
  /** La vraie vidéo YouTube (`npm run youtube`)… */
  video?: Video;
  /** … ou la carte de l'appli de l'étape (`app` de la slide). */
  carte?: CarteAppli;
  /** Le temps qu'il faut, sous la carte (« 1 heure pour apprendre »), en minuscules comme chez lui. */
  sous?: string[];
};

export type Slide = {
  type: "couverture" | "etape";
  /** `sophia` sur LA slide de l'appli (une seule, une étape). */
  app?: Appli;
  [langue: string]: unknown;
};

export type Post = {
  id: string;
  /** Le post refait : url, vues, date, accroche. */
  source?: { url: string; vues: number; publie_le?: string; accroche: string };
  /** L'accroche, lue par l'OS comme le hook. */
  titre: Record<string, string>;
  /** La légende TikTok, 3 ou 4 hashtags. */
  legendes: Record<string, string>;
  musique: { titre: string; url: string };
  notes?: string;
  slides: Slide[];
  /**
   * BLEO (pods/ROUTINE.md §5) : « declinaison » d'une famille de la boîte
   * (`npm run boite`, avec `parent_contenu_id`) ou « full_test » (une accroche
   * neuve, déposée sans le post modèle). Absent : le remake d'un post du compte modèle.
   */
  type_bleo?: "full_test" | "declinaison";
  parent_contenu_id?: string;
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

/** Le texte d'une ligne de couverture (note de pertinence, contrôles). */
export const texteLigneCouverture = (l: LigneCouverture) => (typeof l === "string" ? l : l.t);

// ---------------------------------------------------------------------------
// La couverture
// ---------------------------------------------------------------------------

function couleurCouverture(l: LigneCouverture): { couleur: string; brune: boolean } {
  const c = typeof l === "string" ? "noir" : (l.couleur ?? "noir");
  if (c === "brun") return { couleur: COULEUR.brun, brune: true };
  if (c === "noir") return { couleur: COULEUR.noir, brune: false };
  return { couleur: c, brune: true };
}

async function couverture(ctx: Ctx, c: ContenuCouverture) {
  imageRemplie(ctx, await loadImage(join(RACINE, DECOR.image)), 0, 0, L, H);
  if (!c.lignes?.length) throw new Error("couverture : aucune ligne");
  let y = DECOR.haut;
  let bas = y;
  for (const [i, l] of c.lignes.entries()) {
    const { couleur, brune } = couleurCouverture(l);
    const ligne: LigneTitre = [{ t: texteLigneCouverture(l), couleur }];
    const capMax = (typeof l === "string" ? undefined : l.cap) ?? (brune ? CAP_COUVERTURE.brun : CAP_COUVERTURE.noir);
    const o = { largeur: DECOR.largeur, capMax, centre: DECOR.centre };
    // 23 px entre deux lignes ; l'accent d'une ligne plus haut que ça élargit l'écart (2 px de blanc au-dessus).
    if (i > 0) {
      const m = mesurerTitre(ctx, [ligne], o);
      const accent = depassements(ctx, ligne, m.taille).haut;
      y = bas + Math.max(DECOR.ecart, accent ? accent - 0.06 * m.cap + 2 : 0);
    }
    bas = titreGeant(ctx, [ligne], { ...o, y }).bas;
  }
  if (bas > DECOR.basMax) throw new Error(`couverture : le titre descend à y ${Math.round(bas)} (au plus ${DECOR.basMax}) : baisse un \`cap\` ou raccourcis une ligne`);
}

// ---------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------

/**
 * Le titre d'une étape (relevé sur ses slides du 15/11), centré : la ligne en
 * couleur remplit 820 px au plus sous une capitale de 220 (« GÉRER » : 216,
 * « NÉGOCIER » : 210) ; la ligne noire 730 px sous 146 (« SON ARGENT » : 142).
 * 24 px entre deux lignes, plus la place des accents.
 */
const TITRE = { couleur: { largeur: 820, capMax: 220 }, noir: { largeur: 730, capMax: 146 }, ecart: 24 };

const enCouleur = (ligne: LigneTitre) => typeof ligne !== "string" && ligne.some((m) => m.couleur && m.couleur !== COULEUR.noir);

function titreEtape(ctx: Ctx, c: ContenuEtape, y: number, dessiner: boolean): number {
  let haut = y;
  for (const [i, ligne] of c.titre.entries()) {
    const defaut = enCouleur(ligne) ? TITRE.couleur : TITRE.noir;
    const o = { largeur: defaut.largeur, capMax: c.tailles?.[i] ?? defaut.capMax };
    const m = mesurerTitre(ctx, [ligne], o);
    if (i > 0) haut += depassements(ctx, ligne, m.taille).haut;
    if (dessiner) titreGeant(ctx, [ligne], { ...o, y: haut });
    haut += m.hauteur + TITRE.ecart;
  }
  return haut - TITRE.ecart;
}

/**
 * La mise en page d'une étape, comme les siennes : le bas du titre vers y 545
 * (son haut jamais au-dessus de y 100), la carte 55 px dessous (vers y 600), la
 * ligne du temps 70 px sous la carte.
 */
const BLOC = { basTitre: 545, hautMin: 100, ecartCarte: 55, ecartSous: 70 };
/** La ligne du temps : Anton 70 px (capitale ≈ 60 px), noire, centrée, en minuscules. */
const SOUS = { taille: 70, cap: 60, pas: 86 };

async function etape(ctx: Ctx, s: Slide, c: ContenuEtape) {
  if (!c.video && !(c.carte && s.app)) throw new Error("une étape montre une vraie vidéo YouTube ou la carte de son appli (`app`)");
  const hTitre = titreEtape(ctx, c, 0, false);
  const y0 = Math.max(BLOC.hautMin, BLOC.basTitre - hTitre);
  const yCarte = titreEtape(ctx, c, y0, true) + BLOC.ecartCarte;
  let basCarte: number;
  if (c.video) basCarte = await carteYoutube(ctx, c.video, yCarte);
  else {
    // La carte de l'appli, dans le noir et le cadre d'une carte YouTube : icône, nom, puis ses lignes, centrés.
    const appli = APPLIS[s.app!];
    const texte = c.carte!.texte;
    const contenu = 300 + 55 + 100 + 40 + 44 + (texte.length - 1) * 60 + 12;
    ctx.fillStyle = COULEUR.ytFond;
    ctx.fillRect(CARTE.x, yCarte, CARTE.l, hauteurCarte);
    const y = yCarte + Math.max(40, (hauteurCarte - contenu) / 2);
    icone(ctx, await loadImage(join(RACINE, appli.icone)), (L - 300) / 2, y, 300);
    const n = titreGeant(ctx, [[{ t: c.carte!.nom, couleur: appli.couleur }]], { y: y + 300 + 55, largeur: 900, capMax: 100 });
    lignesCentrees(ctx, texte, { y: n.bas + 40 + 44, police: POLICE.texte, taille: 46, pas: 60, couleur: COULEUR.ytTitre, largeurMax: 900 });
    basCarte = yCarte + hauteurCarte;
  }
  if (c.sous?.length) {
    lignesCentrees(ctx, c.sous, { y: basCarte + BLOC.ecartSous + SOUS.cap, police: policeTitre(), taille: SOUS.taille, pas: SOUS.pas, couleur: COULEUR.noir, largeurMax: 1000 });
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
  choisirPoliceTitre(langue);
  if (s.type === "couverture") await couverture(ctx, c as ContenuCouverture);
  else await etape(ctx, s, c as ContenuEtape);
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 93));
}
