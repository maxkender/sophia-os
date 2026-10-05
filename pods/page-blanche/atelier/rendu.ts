// Rendu d'une slide « page blanche » à partir de sa géométrie d'origine et de
// son texte traduit. Règle de l'étape 1 : TOUT reste à la même place — mêmes
// blocs, même police (Inter), même interligne, mêmes photos recadrées depuis la
// source. Seuls changent le texte (traduit) et les éléments de l'app (Sophia).
//
// Le texte porte ses soulignés sous forme [[mots soulignés]].

import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Boite, ElementGeo, GeometrieSlide } from "./geometrie.ts";

const ICI = dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(join(ICI, "..", "polices", "Inter-Regular.ttf"), "Inter");
GlobalFonts.registerFromPath(join(ICI, "..", "polices", "Inter-Medium.ttf"), "Inter Medium");

const POLICE = "Inter";
const INTERLIGNE_DEFAUT = 1.21; // pas / taille, mesuré sur les blocs multi-lignes d'amaya
const RETRAIT_MAX = 0.84; // on ne rétrécit jamais le texte sous 84 % de la taille d'origine

/** Ce qu'on fait d'une image de la source. */
export type ActionImage = "garder" | "sophia_capture" | "sophia_appstore" | "supprimer";

export type TexteSlide = {
  /** Lignes d'origine telles qu'on les lit (anglais) : servent à calibrer la taille. */
  en: string[];
  /** Texte à rendre (langue du fichier), soulignés entre [[ ]]. Historique : `fr`. */
  fr: string;
  /** Même rôle que `fr`, nom neutre pour les fichiers d'autres langues. Prioritaire. */
  texte?: string;
  alignement?: "gauche" | "droite" | "centre";
  /** Le bloc n'est pas du texte à traduire (barre de recherche, logo pris pour du
   * texte) : on le recopie tel quel depuis la source. */
  garder?: boolean;
};

export type Transcription = {
  textes: Record<string, TexteSlide>;
  images: Record<string, ActionImage>;
  /** Une capture d'app que la détection a éclatée en plusieurs éléments (image
   * + bouts de texte d'interface) : un seul emplacement sur leur rectangle commun. */
  zones?: { elements: string[]; action: "sophia_capture" | "sophia_appstore" }[];
  /** Bloc détecté d'un seul tenant alors qu'il en contient deux (titre collé à
   * son paragraphe) : { "T1": 1 } coupe T1 après sa 1re ligne en T1a et T1b. */
  scissions?: Record<string, number>;
};

/** Applique les scissions demandées à la géométrie (nouveaux blocs a / b). */
export function appliquerScissions(geo: GeometrieSlide, tr: Transcription): GeometrieSlide {
  if (!tr.scissions) return geo;
  const elements: ElementGeo[] = [];
  for (const e of geo.elements) {
    const n = tr.scissions[e.id];
    if (e.type !== "texte" || !n || n >= e.lignes.length) {
      elements.push(e);
      continue;
    }
    for (const [suffixe, ls] of [["a", e.lignes.slice(0, n)], ["b", e.lignes.slice(n)]] as const) {
      const x0 = Math.min(...ls.map((l) => l.x));
      const y0 = Math.min(...ls.map((l) => l.y));
      const boite = { x: x0, y: y0, l: Math.max(...ls.map((l) => l.x + l.l)) - x0, h: Math.max(...ls.map((l) => l.y + l.h)) - y0 };
      const pas = ls.length > 1 ? ls[1].base - ls[0].base : 0;
      elements.push({ id: `${e.id}${suffixe}`, type: "texte", boite, lignes: [...ls], pas, alignement: e.alignement });
    }
  }
  return { ...geo, elements };
}

export type RapportSlide = { avertissements: string[] };

type Segment = { mot: string; souligne: boolean };

/** Visuels de l'app à poser à la place de ceux du concurrent. */
export type RessourcesApp = { captures: Image[]; appstore: Image | null };

const DOSSIER_ASSETS = join(ICI, "..", "assets", "sophia");

/** Captures de la langue demandée (repli : anglais) + fiche App Store (anglais partout). */
export async function chargerRessources(langue: string, dossier = DOSSIER_ASSETS): Promise<RessourcesApp> {
  const { existsSync, readdirSync } = await import("node:fs");
  const dossierLangue = existsSync(join(dossier, langue)) ? join(dossier, langue) : join(dossier, "en");
  const captures: Image[] = [];
  if (existsSync(dossierLangue)) {
    for (const f of readdirSync(dossierLangue).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort()) {
      captures.push(await loadImage(join(dossierLangue, f)));
    }
  }
  const fiche = join(dossier, "appstore.jpg");
  return { captures, appstore: existsSync(fiche) ? await loadImage(fiche) : null };
}

export async function rendreSlide(
  source: string | Buffer,
  geo: GeometrieSlide,
  tr: Transcription,
  options: { ressources?: RessourcesApp; variante?: number } = {},
): Promise<{ jpeg: Buffer; rapport: RapportSlide }> {
  geo = appliquerScissions(geo, tr);
  const capture = options.ressources?.captures.length
    ? options.ressources.captures[(options.variante ?? 0) % options.ressources.captures.length]
    : null;
  const appstore = options.ressources?.appstore ?? null;
  const poserCapture = (b: Boite) =>
    capture ? dessinerCapture(ctx, capture, b) : dessinerEmplacement(ctx, b, "CAPTURE APP SOPHIA", true);
  const poserFiche = (b: Boite) =>
    appstore ? dessinerFiche(ctx, appstore, b) : dessinerEmplacement(ctx, b, "FICHE APP STORE SOPHIA", false);
  const imgSource = await loadImage(source);
  const canvas = createCanvas(geo.largeur, geo.hauteur);
  const ctx = canvas.getContext("2d");
  const avertissements: string[] = [];

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, geo.largeur, geo.hauteur);

  // Zones fusionnées : leurs éléments ne sont pas dessinés un par un.
  const fusionnes = new Set((tr.zones ?? []).flatMap((z) => z.elements));
  // Pour la mise en page du texte, une zone compte comme UNE image (son rectangle
  // commun) : le texte voisin doit la contourner comme une vraie capture.
  const unions: ElementGeo[] = [];
  for (const z of tr.zones ?? []) {
    const boites = geo.elements.filter((e) => z.elements.includes(e.id)).map((e) => e.boite);
    if (!boites.length) {
      avertissements.push(`zone ${z.elements.join("+")} : aucun élément trouvé`);
      continue;
    }
    const x = Math.min(...boites.map((b) => b.x));
    const y = Math.min(...boites.map((b) => b.y));
    const union = { x, y, l: Math.max(...boites.map((b) => b.x + b.l)) - x, h: Math.max(...boites.map((b) => b.y + b.h)) - y };
    unions.push({ id: `Z${unions.length + 1}`, type: "image", boite: union });
    if (z.action === "sophia_capture") poserCapture(union);
    else poserFiche(union);
  }

  // Images d'abord : le texte ne passe jamais dessous.
  for (const e of geo.elements) {
    if (e.type !== "image" || fusionnes.has(e.id)) continue;
    const action = tr.images[e.id] ?? "garder";
    if (action === "garder") dessinerRecadrage(ctx, imgSource, e.boite);
    else if (action === "sophia_capture") poserCapture(e.boite);
    else if (action === "sophia_appstore") poserFiche(e.boite);
  }

  const geoTexte: GeometrieSlide = { ...geo, elements: [...geo.elements.filter((e) => !fusionnes.has(e.id)), ...unions] };
  const textes = geo.elements.filter((e): e is Extract<ElementGeo, { type: "texte" }> => e.type === "texte");
  for (const e of textes) {
    if (fusionnes.has(e.id)) continue;
    const t = tr.textes[e.id];
    if (!t) {
      avertissements.push(`${e.id} : pas de transcription, bloc laissé vide`);
      continue;
    }
    if (t.garder) {
      dessinerRecadrage(ctx, imgSource, e.boite);
      continue;
    }
    if (!(t.texte ?? t.fr).trim()) continue;
    dessinerBloc(ctx, e, t, geoTexte, avertissements);
  }

  return { jpeg: await canvas.encode("jpeg", 95), rapport: { avertissements } };
}

function dessinerRecadrage(ctx: SKRSContext2D, source: Image, b: Boite) {
  ctx.drawImage(source, b.x, b.y, b.l, b.h, b.x, b.y, b.l, b.h);
}

/** Capture d'écran de l'app : remplit la boîte (recadrage par le haut, comme une
 * capture de téléphone), coins arrondis. */
function dessinerCapture(ctx: SKRSContext2D, img: Image, b: Boite) {
  const echelle = Math.max(b.l / img.width, b.h / img.height);
  const sl = b.l / echelle;
  const sh = b.h / echelle;
  const sx = (img.width - sl) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.l, b.h, Math.min(40, b.l * 0.07));
  ctx.clip();
  ctx.drawImage(img, sx, 0, sl, sh, b.x, b.y, b.l, b.h);
  ctx.restore();
}

/** Fiche App Store : contenue dans la boîte, centrée, sur fond blanc. */
function dessinerFiche(ctx: SKRSContext2D, img: Image, b: Boite) {
  const echelle = Math.min(b.l / img.width, b.h / img.height);
  const l = img.width * echelle;
  const h = img.height * echelle;
  ctx.drawImage(img, b.x + (b.l - l) / 2, b.y + (b.h - h) / 2, l, h);
}

function dessinerEmplacement(ctx: SKRSContext2D, b: Boite, libelle: string, arrondi: boolean) {
  ctx.save();
  ctx.fillStyle = "#e8eef0";
  ctx.strokeStyle = "#9aa7ad";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  const r = arrondi ? Math.min(36, b.l * 0.08) : Math.min(16, b.h * 0.15);
  ctx.beginPath();
  ctx.roundRect(b.x + 1.5, b.y + 1.5, b.l - 3, b.h - 3, r);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#5b6a70";
  const taille = Math.max(14, Math.min(30, b.l / 12, b.h / 4));
  ctx.font = `${taille}px "Inter Medium"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const mots = libelle.split(" ");
  const lignes = b.h > taille * 4 ? [mots.slice(0, 2).join(" "), mots.slice(2).join(" ")] : [libelle];
  lignes.forEach((l, i) => ctx.fillText(l, b.x + b.l / 2, b.y + b.h / 2 + (i - (lignes.length - 1) / 2) * taille * 1.3));
  ctx.restore();
}

/** Taille de police telle que la ligne d'origine la plus longue a la même largeur d'encre. */
function calibrerTaille(ctx: SKRSContext2D, e: Extract<ElementGeo, { type: "texte" }>, en: string[]): number {
  // On calibre sur la ligne d'origine la plus longue : c'est la mesure la plus précise.
  const mesures: { taille: number; poids: number }[] = [];
  ctx.font = `100px ${POLICE}`;
  e.lignes.forEach((li, i) => {
    const texte = en[i];
    if (!texte || texte.length < 6) return;
    const m = ctx.measureText(texte);
    const encre = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    if (encre > 0) mesures.push({ taille: (100 * li.l) / encre, poids: texte.length });
  });
  mesures.sort((a, b) => b.poids - a.poids);
  if (mesures.length) return mesures[0].taille;
  // Texte trop court pour une mesure de largeur fiable (« 4. », « 1/10 ») :
  // on calibre sur la HAUTEUR d'encre de la ligne, sans le soulignement.
  const court = en.find((t) => t && t.trim());
  if (court) {
    // Du haut de l'encre à la ligne de base, dans l'original comme à 100 px.
    const m = ctx.measureText(court);
    const hauteur = e.lignes[0].base - e.lignes[0].y + 1;
    if (m.actualBoundingBoxAscent > 0) return (100 * hauteur) / m.actualBoundingBoxAscent;
  }
  return e.lignes[0].h / 0.95;
}

function segmenter(texte: string): Segment[][] {
  // Paragraphes forcés par "\n" ; chaque mot garde son état souligné.
  return texte.split("\n").map((para) => {
    const segs: Segment[] = [];
    const re = /\[\[(.+?)\]\]|([^[]+|\[)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) {
      const souligne = m[1] !== undefined;
      const morceau = souligne ? m[1] : m[2];
      for (const mot of morceau.split(/(\s+)/)) if (mot) segs.push({ mot, souligne });
    }
    return segs;
  });
}

type LigneMise = Segment[];

/** Coupe en lignes ; la largeur permise dépend du rang de la ligne (une photo
 * peut commencer à côté de la 2e ligne d'un bloc dont la 1re passe au-dessus). */
function couper(ctx: SKRSContext2D, paras: Segment[][], largeurDe: (i: number) => number): LigneMise[] {
  const lignes: LigneMise[] = [];
  for (const segs of paras) {
    let courante: Segment[] = [];
    let l = 0;
    for (const s of segs) {
      const w = ctx.measureText(s.mot).width;
      const espace = /^\s+$/.test(s.mot);
      if (!espace && l + w > largeurDe(lignes.length) && courante.some((c) => !/^\s+$/.test(c.mot))) {
        while (courante.length && /^\s+$/.test(courante[courante.length - 1].mot)) courante.pop();
        lignes.push(courante);
        courante = [];
        l = 0;
      }
      if (espace && courante.length === 0) continue;
      courante.push(s);
      l += w;
    }
    while (courante.length && /^\s+$/.test(courante[courante.length - 1].mot)) courante.pop();
    lignes.push(courante);
  }
  return lignes;
}

function largeurLigne(ctx: SKRSContext2D, l: LigneMise) {
  return l.reduce((a, s) => a + ctx.measureText(s.mot).width, 0);
}

/** Bas de l'espace libre sous le bloc : le haut du prochain élément qui chevauche sa colonne. */
function limiteBasse(e: Extract<ElementGeo, { type: "texte" }>, geo: GeometrieSlide, largeur: number, x0: number): number {
  let lim = geo.hauteur - 30;
  for (const o of geo.elements) {
    if (o === e) continue;
    const b = o.boite;
    if (b.y <= e.boite.y) continue;
    if (b.x < x0 + largeur && b.x + b.l > x0) lim = Math.min(lim, b.y - 14);
  }
  return lim;
}

/** Abscisse maximale à droite d'une bande horizontale [haut, bas] partant de x :
 * le prochain élément qu'elle croise, sinon la marge symétrique de la page. */
function bordDroit(e: Extract<ElementGeo, { type: "texte" }>, geo: GeometrieSlide, haut: number, bas: number): number {
  let lim = geo.largeur - 34; // marge droite d'amaya ≈ marge gauche
  for (const o of geo.elements) {
    if (o === e) continue;
    const b = o.boite;
    if (b.y < bas && b.y + b.h > haut && b.x > e.boite.x + 20) lim = Math.min(lim, b.x - 16);
  }
  return lim;
}

function dessinerBloc(
  ctx: SKRSContext2D,
  e: Extract<ElementGeo, { type: "texte" }>,
  t: TexteSlide,
  geo: GeometrieSlide,
  avert: string[],
) {
  const tailleOrigine = calibrerTaille(ctx, e, t.en);
  // Interligne mesuré, borné : un soulignement mal attribué à une ligne fausse
  // la ligne de base mesurée ; amaya reste toujours entre ~1,15 et ~1,4.
  const mesure = e.lignes.length > 1 && e.pas > 0 ? e.pas / tailleOrigine : INTERLIGNE_DEFAUT;
  const ratioPas = Math.min(1.45, Math.max(1.12, mesure));
  const alignement = t.alignement ?? e.alignement;
  const paras = segmenter(t.texte ?? t.fr);
  const premiereBase = e.lignes[0].base;
  const largeurOrigine = Math.max(...e.lignes.map((l) => l.l));
  const uneLigne = e.lignes.length === 1;
  const centre = e.boite.x + e.boite.l / 2;
  const droite = e.boite.x + e.boite.l;
  // Largeur permise pour la ligne i à la taille t (alignement à gauche :
  // jusqu'au prochain obstacle à droite de CETTE ligne).
  const largeurPermise = (t: number, i: number) => {
    const base = premiereBase + i * t * ratioPas;
    if (alignement === "gauche") return bordDroit(e, geo, base - t * 0.8, base + t * 0.3) - e.boite.x;
    if (alignement === "droite") return uneLigne ? droite - 32 : largeurOrigine * 1.25;
    return uneLigne ? 2 * Math.min(centre - 32, geo.largeur - 32 - centre) : largeurOrigine * 1.25;
  };

  // Bloc d'une ligne (titre, mention) : toute la largeur disponible, comme
  // l'auteur l'aurait fait. Bloc multi-lignes : d'abord la largeur de colonne
  // d'origine, puis plus large ; en dernier recours, police plus petite.
  const essais: { taille: number; largeurDe: (i: number) => number }[] = [];
  for (let k = 1; k >= RETRAIT_MAX - 1e-9; k -= 0.04) {
    const t = tailleOrigine * k;
    if (!uneLigne) essais.push({ taille: t, largeurDe: (i) => Math.min(largeurOrigine * 1.04, largeurPermise(t, i)) });
    essais.push({ taille: t, largeurDe: (i) => largeurPermise(t, i) });
  }
  let choix: { taille: number; lignes: LigneMise[] } | null = null;
  for (const es of essais) {
    ctx.font = `${es.taille}px ${POLICE}`;
    const lignes = couper(ctx, paras, es.largeurDe);
    const pas = es.taille * ratioPas;
    const bas = premiereBase + (lignes.length - 1) * pas + es.taille * 0.25;
    // Seule la DERNIÈRE ligne peut heurter ce qui est en dessous ; les côtés
    // sont déjà tenus ligne par ligne.
    const largeurUtile = largeurLigne(ctx, lignes[lignes.length - 1]);
    const x0 =
      alignement === "gauche"
        ? e.boite.x
        : alignement === "droite"
          ? e.boite.x + e.boite.l - largeurUtile
          : e.boite.x + e.boite.l / 2 - largeurUtile / 2;
    const tropLarge = lignes.some((l, i) => largeurLigne(ctx, l) > es.largeurDe(i) + 1);
    if (bas <= limiteBasse(e, geo, largeurUtile, x0) && !tropLarge) {
      choix = { taille: es.taille, lignes };
      break;
    }
  }
  if (!choix) {
    const es = essais[essais.length - 1];
    ctx.font = `${es.taille}px ${POLICE}`;
    choix = { taille: es.taille, lignes: couper(ctx, paras, es.largeurDe) };
    avert.push(`${e.id} : texte trop long, il déborde de son espace (${choix.lignes.length} lignes)`);
  }

  const { taille, lignes } = choix;
  const pas = taille * ratioPas;
  ctx.font = `${taille}px ${POLICE}`;
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const epaisseur = Math.max(1.6, taille * 0.052);
  const decalage = taille * 0.115;

  lignes.forEach((ligne, i) => {
    const base = premiereBase + i * pas;
    const w = largeurLigne(ctx, ligne);
    let x =
      alignement === "gauche"
        ? e.boite.x
        : alignement === "droite"
          ? e.boite.x + e.boite.l - w
          : e.boite.x + e.boite.l / 2 - w / 2;
    // Soulignés : un trait continu par suite de segments soulignés (espaces
    // compris entre deux mots soulignés, jamais en bord de suite).
    let debut: number | null = null;
    let fin = 0;
    ligne.forEach((s, j) => {
      const ws = ctx.measureText(s.mot).width;
      const espace = /^\s+$/.test(s.mot);
      ctx.fillText(s.mot, x, base);
      const suivantSouligne = ligne.slice(j + 1).find((n) => !/^\s+$/.test(n.mot))?.souligne ?? false;
      if (s.souligne && !espace) {
        if (debut === null) debut = x;
        fin = x + ws;
      }
      const coupe = !s.souligne || (espace && !suivantSouligne) || j === ligne.length - 1;
      if (debut !== null && coupe) {
        ctx.fillRect(debut, base + decalage, fin - debut, epaisseur);
        debut = null;
      }
      x += ws;
    });
  });
}
