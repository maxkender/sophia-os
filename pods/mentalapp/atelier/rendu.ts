// Rendu d'une slide refaite : la slide source, ses textes effacés (aplat de la
// couleur du fond autour), puis réécrits dans la langue voulue avec Inter Tight
// à la même place et à la même taille ; leur appli remplacée par l'icône
// UnSwipe et sa légende. Les images (détourées, photos) restent au pixel près.
//
// La taille est calée sur l'original : la largeur d'encre de chaque ligne
// anglaise source, mesurée sur la slide, divisée par sa largeur en Inter Tight.

import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Langue } from "./api.ts";
import { LEGENDE_APP, RAYON_ICONE } from "./app.ts";
import { rgb, type Boite } from "./geometrie.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import type { BlocTexte, Transcription } from "./transcription.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAMILLES: Record<number, string> = { 200: "IT ExtraLight", 300: "IT Light", 400: "IT Regular", 600: "IT SemiBold" };
GlobalFonts.registerFromPath(join(RACINE, "polices/InterTight-ExtraLight.ttf"), FAMILLES[200]);
GlobalFonts.registerFromPath(join(RACINE, "polices/InterTight-Light.ttf"), FAMILLES[300]);
GlobalFonts.registerFromPath(join(RACINE, "polices/InterTight-Regular.ttf"), FAMILLES[400]);
GlobalFonts.registerFromPath(join(RACINE, "polices/InterTight-SemiBold.ttf"), FAMILLES[600]);

/** Pas d'une ligne à l'autre, en part de la taille de police (légendes serrées du compte). */
const INTERLIGNE = 0.88;
/** La police ne descend jamais sous cette part de la taille calée. */
const REDUCTION_MAX = 0.72;

const mediane = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

type Mesure = { encre: number; gauche: number; droite: number; asc: number; desc: number };

/**
 * Mesure (et prépare le dessin d') un texte : police, graisse, et approche
 * (espacement entre lettres, en part de la taille ; négatif = serré).
 */
function mesurer(ctx: SKRSContext2D, texte: string, taille: number, graisse: number, approche = 0): Mesure {
  ctx.font = `${taille}px "${FAMILLES[graisse] ?? FAMILLES[300]}"`;
  ctx.letterSpacing = `${approche * taille}px`;
  const m = ctx.measureText(texte);
  return {
    encre: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
    gauche: m.actualBoundingBoxLeft,
    droite: m.actualBoundingBoxRight,
    asc: m.actualBoundingBoxAscent,
    desc: m.actualBoundingBoxDescent,
  };
}

/**
 * Graisse d'un bloc : celle imposée, sinon ExtraLight pour un grand titre (au
 * delà d'une ligne de 90 px, le trait du compte reste très fin) et Light pour
 * le reste.
 */
export function graisseDe(b: BlocTexte): number {
  if (b.graisse) return b.graisse;
  return Math.max(...b.lignes.map((l) => l[3])) >= 90 ? 200 : 300;
}

/**
 * Approche d'un bloc : les titres du compte sont plus serrés qu'Inter Tight
 * (-0,03 em au-delà de 90 px de ligne, -0,02 em au-delà de 40 px) ; les
 * légendes, non.
 */
export function approcheDe(b: BlocTexte): number {
  const h = Math.max(...b.lignes.map((l) => l[3]));
  return h >= 90 ? -0.03 : h >= 40 ? -0.02 : 0;
}

/**
 * Taille calée d'un bloc : largeur d'encre source / largeur Inter Tight à
 * 100 px, ligne par ligne (médiane). Une ligne trop courte pour la largeur
 * (« A », « 2l+ ») est calée sur sa hauteur.
 */
export function tailleCalee(ctx: SKRSContext2D, b: BlocTexte): number {
  const graisse = graisseDe(b);
  const approche = approcheDe(b);
  const tailles = b.lignes.map((boite, i) => {
    const en = (b.en[i] ?? "").trim();
    const m = mesurer(ctx, en || "Hx", 100, graisse, approche);
    if (en.length >= 4 && m.encre > 0) return (100 * boite[2]) / m.encre;
    return (100 * boite[3]) / Math.max(1, m.asc + m.desc);
  });
  return mediane(tailles);
}

/**
 * Largeur disponible d'une ligne, selon l'alignement et l'espace libre autour
 * du bloc. Centré : tout l'espace libre (la ligne se décale au besoin).
 */
function largeurMax(b: BlocTexte): number {
  const [x, , l] = b.boite;
  const [g, d] = b.libre;
  if (b.alignement === "gauche") return d - x;
  if (b.alignement === "droite") return x + l - g;
  return d - g;
}

/**
 * Abscisse du point d'ancrage pour que l'encre soit placée comme l'original ;
 * une ligne centrée qui déborderait de son espace libre glisse vers le côté libre.
 */
function abscisse(b: BlocTexte, m: Mesure): number {
  const [x, , l] = b.boite;
  if (b.alignement === "gauche") return x + m.gauche;
  if (b.alignement === "droite") return x + l - m.droite;
  const [g, d] = b.libre;
  let gauche = x + l / 2 - m.encre / 2;
  gauche = Math.min(Math.max(gauche, g), Math.max(g, d - m.encre));
  return gauche + m.gauche;
}

const elargir = ([x, y, l, h]: Boite, mx: number, my = mx): Boite => [x - mx, y - my, l + 2 * mx, h + 2 * my];

/**
 * Les traits droits d'un tableau : suites d'au moins 60 px de pixels sombres
 * sur une ligne ou une colonne, avec leur pixel voisin (anticrénelage).
 */
function traitsDuTableau(px: Uint8ClampedArray, L: number, H: number): Uint8Array {
  // Noir (pas une case rouge, sombre elle aussi) et fin : un aplat noir épais
  // (leur icône) n'est pas un trait.
  const noir = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= L || y >= H) return false;
    const i = (y * L + x) * 4;
    const ch = Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
    return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 110 && ch <= 60;
  };
  const sombre = (x: number, y: number, horizontal: boolean) =>
    noir(x, y) && (horizontal ? !noir(x, y - 4) && !noir(x, y + 4) : !noir(x - 4, y) && !noir(x + 4, y));
  const m = new Uint8Array(L * H);
  const marquer = (x: number, y: number) => {
    for (let d = -1; d <= 1; d++) {
      if (y + d >= 0 && y + d < H) m[(y + d) * L + x] = 1;
      if (x + d >= 0 && x + d < L) m[y * L + x + d] = 1;
    }
  };
  for (let y = 0; y < H; y++) {
    let debut = -1;
    for (let x = 0; x <= L; x++) {
      if (x < L && sombre(x, y, true)) {
        if (debut < 0) debut = x;
      } else if (debut >= 0) {
        if (x - debut >= 60) for (let xx = debut; xx < x; xx++) marquer(xx, y);
        debut = -1;
      }
    }
  }
  for (let x = 0; x < L; x++) {
    let debut = -1;
    for (let y = 0; y <= H; y++) {
      if (y < H && sombre(x, y, false)) {
        if (debut < 0) debut = y;
      } else if (debut >= 0) {
        if (y - debut >= 60) for (let yy = debut; yy < y; yy++) marquer(x, yy);
        debut = -1;
      }
    }
  }
  return m;
}

function aplat(ctx: SKRSContext2D, boite: Boite, couleur: string) {
  ctx.fillStyle = couleur;
  ctx.fillRect(...boite);
}

/**
 * Efface l'encre isolée restée près d'un bloc effacé (point du « ? », point du
 * « i » d'un titre, virgule) : toute petite tache sombre entièrement dans la
 * zone, ni trop grande ni collée au bord (donc pas un morceau d'image).
 */
function nettoyerEncre(ctx: SKRSContext2D, zone: Boite, couleur: string, hLigne: number) {
  const [zx, zy, zl, zh] = zone.map(Math.round) as Boite;
  if (zl <= 2 || zh <= 2) return;
  const img = ctx.getImageData(zx, zy, zl, zh);
  const px = img.data;
  const sombre = (p: number) => 0.299 * px[p * 4] + 0.587 * px[p * 4 + 1] + 0.114 * px[p * 4 + 2] < 170;
  const vu = new Uint8Array(zl * zh);
  const [r, g, bl] = rgb(couleur);
  let change = false;
  for (let depart = 0; depart < zl * zh; depart++) {
    if (vu[depart] || !sombre(depart)) continue;
    const pile = [depart];
    const membres: number[] = [];
    vu[depart] = 1;
    let bord = false;
    let y0 = zh;
    let y1 = 0;
    while (pile.length) {
      const p = pile.pop()!;
      membres.push(p);
      const x = p % zl;
      const y = (p - x) / zl;
      if (x === 0 || y === 0 || x === zl - 1 || y === zh - 1) bord = true;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= zl || yy >= zh) continue;
          const q = yy * zl + xx;
          if (!vu[q] && sombre(q)) {
            vu[q] = 1;
            pile.push(q);
          }
        }
      }
    }
    if (bord || y1 - y0 + 1 > 0.7 * hLigne || membres.length > 0.12 * hLigne * hLigne) continue;
    // Seule une tache posée sur le fond part : jamais un détail d'image voisine.
    let x0 = zl;
    let x1 = 0;
    for (const p of membres) {
      x0 = Math.min(x0, p % zl);
      x1 = Math.max(x1, p % zl);
    }
    let anneau = 0;
    let proches = 0;
    for (let y = Math.max(0, y0 - 3); y <= Math.min(zh - 1, y1 + 3); y++) {
      for (let x = Math.max(0, x0 - 3); x <= Math.min(zl - 1, x1 + 3); x++) {
        if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) continue;
        const i = (y * zl + x) * 4;
        anneau++;
        if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - bl) <= 40) proches++;
      }
    }
    if (!anneau || proches / anneau < 0.75) continue;
    // La tache et son halo anticrénelé (1 px autour) prennent la couleur du fond.
    for (const p of membres) {
      const x = p % zl;
      const y = (p - x) / zl;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= zl || yy >= zh) continue;
          const i = (yy * zl + xx) * 4;
          px[i] = r;
          px[i + 1] = g;
          px[i + 2] = bl;
        }
      }
    }
    change = true;
  }
  if (change) ctx.putImageData(img, zx, zy);
}

/** Les lignes d'un bloc dans une langue (le remake anglais reprend `en` par défaut). */
export function lignesDe(b: BlocTexte, langue: Langue): string[] | null {
  const t = b.textes[langue] ?? (langue === "en" ? b.en : undefined);
  return t && t.length ? t : null;
}

/** Coupe un texte en lignes qui tiennent dans `max` px (mot à mot). */
function couper(ctx: SKRSContext2D, texte: string, taille: number, graisse: number, max: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = "";
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (!courante || mesurer(ctx, essai, taille, graisse).encre <= max) courante = essai;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

export type ResultatRendu = { jpeg: Buffer; avertissements: string[] };

export async function rendreSlide(
  cheminSource: string,
  t: Transcription,
  position: number,
  langue: Langue,
  icone: Image,
): Promise<ResultatRendu> {
  const slide = t.slides.find((s) => s.position === position);
  if (!slide) throw new Error(`slide ${position} absente de la transcription`);
  const source = await loadImage(cheminSource);
  const c = createCanvas(source.width, source.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const avert: string[] = [];
  const ou = (b: BlocTexte) => `${langue} #${position} ${b.id}`;

  // Traits du tableau (lignes et colonnes sombres d'au moins 60 px) : ils
  // passent souvent à 2 px sous une légende, l'effacement ne doit pas les entamer.
  const avant = ctx.getImageData(0, 0, source.width, source.height);
  const traits = traitsDuTableau(avant.data, source.width, source.height);

  const app = t.app && t.app.position === position ? t.app : null;
  const blocApp = app ? slide.blocs.find((b) => b.id === app.legende) : undefined;
  if (app && !blocApp) throw new Error(`légende de l'appli ${app.legende} absente de la slide ${position}`);
  const aReecrire = slide.blocs.filter((b) => b !== blocApp && b.action === "traduire");
  const aEffacer = slide.blocs.filter((b) => b === blocApp || b.action !== "garder");

  // 1. Effacer : tous les textes à refaire (et leur appli) d'abord, pour qu'un
  // effacement n'entame jamais un texte déjà réécrit à côté.
  const tailles = new Map<BlocTexte, number>();
  for (const b of aEffacer) {
    if (b.lignes.length && b.en.length !== b.lignes.length && b.action === "traduire") {
      throw new Error(`${ou(b)} : ${b.en.length} ligne(s) anglaise(s) pour ${b.lignes.length} ligne(s) détectée(s)`);
    }
    const hLigne = Math.max(...b.lignes.map((l) => l[3]));
    for (const l of b.lignes) aplat(ctx, elargir(l, Math.max(3, Math.round(0.14 * l[3])), Math.max(2, Math.round(0.1 * l[3]))), b.fond);
    nettoyerEncre(ctx, elargir(b.boite, Math.round(0.45 * hLigne), Math.round(0.35 * hLigne)), b.fond, hLigne);
    if (b.en.length) tailles.set(b, tailleCalee(ctx, b));
  }
  if (app) aplat(ctx, elargir(app.icone, 3), blocApp!.fond);
  // Les traits du tableau reviennent tels quels, sauf dans les lignes de texte
  // remplacées : la barre d'un « e » ou le jambage d'un « i » de titre ont la
  // forme d'un trait.
  for (const b of aEffacer) {
    for (const [x, y, l, h] of b.lignes) {
      for (let yy = Math.max(0, y); yy < Math.min(source.height, y + h); yy++) traits.fill(0, yy * source.width + Math.max(0, x), yy * source.width + Math.min(source.width, x + l));
    }
  }
  if (app) {
    const [x, y, l, h] = elargir(app.icone, 3);
    for (let yy = Math.max(0, y); yy < Math.min(source.height, y + h); yy++) traits.fill(0, yy * source.width + Math.max(0, x), yy * source.width + Math.min(source.width, x + l));
  }
  const apres = ctx.getImageData(0, 0, source.width, source.height);
  for (let p = 0; p < traits.length; p++) {
    if (!traits[p]) continue;
    for (let k = 0; k < 4; k++) apres.data[p * 4 + k] = avant.data[p * 4 + k];
  }
  ctx.putImageData(apres, 0, 0);

  // L'élément UnSwipe (posé avant les textes : ses lignes sont un obstacle
  // fixe pour les traductions voisines) : la légende de la langue, à la
  // taille de la leur ou un peu moins, l'icône au-dessus, à leur place.
  type PoseApp = { cote: number; ix: number; iy: number; s: number; couleur: string; lignes: { texte: string; x: number; base: number; boite: Boite }[] };
  let poseApp: PoseApp | null = null;
  if (app && blocApp) {
    const capTaille = tailles.get(blocApp) ?? tailleCalee(ctx, blocApp);
    const { texte, appli } = LEGENDE_APP[langue];
    const [ix, iy, il, ih] = app.icone;
    const cx = ix + il / 2;
    const haut = Math.min(iy, blocApp.boite[1]);
    const bas = blocApp.boite[1] + blocApp.boite[3];
    const [g, d] = blocApp.libre;
    const max = Math.max(d - g, il) - 6;
    // Deux exigences, dans l'ordre : une icône presque à sa taille (85 %) avec
    // une légende à 85 % au moins ; sinon une icône à 62 % au moins.
    const exigences = [
      { icone: 0.85, taille: 0.85 },
      { icone: 0.62, taille: REDUCTION_MAX },
    ];
    for (const exige of exigences) for (let s = capTaille; s >= exige.taille * capTaille && !poseApp; s -= 0.25) {
      if (mesurer(ctx, appli, s, 300).encre > max) continue;
      const lignes = [...couper(ctx, texte, s, 300, max), appli];
      if (lignes.some((l) => mesurer(ctx, l, s, 300).encre > max)) continue;
      const pas = (lignes.length >= 3 ? 0.95 : INTERLIGNE) * s;
      const asc = mesurer(ctx, lignes[0], s, 300).asc;
      const desc = mesurer(ctx, lignes[lignes.length - 1], s, 300).desc;
      const derniereBase = bas - desc;
      const hautLegende = derniereBase - (lignes.length - 1) * pas - asc;
      const ecart = 0.15 * s;
      const cote = Math.min(ih, hautLegende - ecart - haut);
      if (cote < exige.icone * ih) continue;
      poseApp = {
        cote,
        ix: cx - cote / 2,
        iy: haut + (hautLegende - ecart - haut - cote) / 2,
        s,
        couleur: blocApp.couleur_texte ?? blocApp.couleur,
        lignes: lignes.map((texteLigne, k) => {
          const m = mesurer(ctx, texteLigne, s, 300);
          // Centrée sous l'icône, mais toujours dans son espace libre.
          const gauche = Math.min(Math.max(cx - m.encre / 2, g + 3), Math.max(g + 3, d - 3 - m.encre));
          const base = derniereBase - (lignes.length - 1 - k) * pas;
          return { texte: texteLigne, x: gauche + m.gauche, base, boite: [gauche, base - m.asc, m.encre, m.asc + m.desc] as Boite };
        }),
      };
      if (s < 0.9 * capTaille) avert.push(`${langue} #${position} appli : légende réduite à ${Math.round((100 * s) / capTaille)} %`);
    }
    if (!poseApp) throw new Error(`${langue} #${position} : l'élément UnSwipe ne tient pas dans sa case`);
  }

  // 2. Réécrire chaque bloc à sa place : d'abord sa mise en page (taille
  // calée, réduite s'il déborde de son espace libre), puis les collisions entre
  // traductions voisines (la plus large rapetisse), puis le dessin.
  type Pose = { b: BlocTexte; lignes: string[]; graisse: number; approche: number; taille: number; min: number };
  const poses: Pose[] = [];
  for (const b of aReecrire) {
    const lignes = lignesDe(b, langue);
    if (!lignes) throw new Error(`${ou(b)} : pas de texte en ${langue}`);
    const graisse = graisseDe(b);
    const approche = approcheDe(b);
    const calee = tailles.get(b) ?? tailleCalee(ctx, b);
    let taille = calee;
    const max = largeurMax(b);
    const plusLarge = Math.max(...lignes.map((l) => mesurer(ctx, l, taille, graisse, approche).encre));
    if (plusLarge > max) {
      const reduite = (taille * max) / plusLarge;
      if (reduite < REDUCTION_MAX * taille) avert.push(`${ou(b)} : trop large même à ${Math.round(REDUCTION_MAX * 100)} % (coupe la ligne)`);
      taille = Math.max(reduite, REDUCTION_MAX * taille);
    }
    poses.push({ b, lignes, graisse, approche, taille, min: REDUCTION_MAX * calee });
    if (lignes.length !== b.lignes.length) avert.push(`${ou(b)} : ${lignes.length} ligne(s) au lieu de ${b.lignes.length}`);
  }
  /** Lignes de base d'un bloc posé : celles de l'original, puis au même pas. */
  const basesDe = (p: Pose) => {
    const bases = p.b.lignes.map((l, i) => l[1] + mesurer(ctx, p.b.en[i] || "Hx", p.taille, p.graisse, p.approche).asc);
    const pas = bases.length >= 2 ? (bases[bases.length - 1] - bases[0]) / (bases.length - 1) : INTERLIGNE * p.taille;
    const premiere = (p.b.ancre ?? "haut") === "bas" ? bases[bases.length - 1] - (p.lignes.length - 1) * pas : bases[0];
    return p.lignes.map((_, k) => premiere + k * pas);
  };
  /** Boîtes d'encre des lignes d'un bloc posé. */
  const encreDe = (p: Pose): Boite[] => {
    const bases = basesDe(p);
    return p.lignes.map((ligne, k) => {
      const m = mesurer(ctx, ligne, p.taille, p.graisse, p.approche);
      const x = abscisse(p.b, m);
      return [x - m.gauche, bases[k] - m.asc, m.encre, m.asc + m.desc];
    });
  };
  const touche = (a: Boite, b: Boite, marge: number) =>
    a[0] < b[0] + b[2] + marge && b[0] < a[0] + a[2] + marge && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const obstacles: Boite[] = poseApp ? [...poseApp.lignes.map((l) => l.boite), [poseApp.ix, poseApp.iy, poseApp.cote, poseApp.cote]] : [];
  for (let tour = 0; tour < 40; tour++) {
    let change = false;
    for (const p of poses) {
      const e = encreDe(p);
      if (!e.some((a) => obstacles.some((o) => touche(a, o, Math.max(8, 0.35 * p.taille))))) continue;
      if (p.taille * 0.97 < p.min) continue;
      p.taille *= 0.97;
      change = true;
    }
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        const A = encreDe(poses[i]);
        const B = encreDe(poses[j]);
        const marge = Math.max(8, 0.35 * Math.min(poses[i].taille, poses[j].taille));
        if (!A.some((a) => B.some((b) => touche(a, b, marge)))) continue;
        // La plus large (relativement à son original) rapetisse d'un cran.
        const largeurRel = (p: Pose, e: Boite[]) => Math.max(...e.map((x) => x[2])) / p.b.boite[2];
        const p = largeurRel(poses[i], A) >= largeurRel(poses[j], B) ? poses[i] : poses[j];
        if (p.taille * 0.97 < p.min) continue;
        p.taille *= 0.97;
        change = true;
      }
    }
    if (!change) break;
  }
  for (const p of poses) {
    const bases = basesDe(p);
    ctx.fillStyle = p.b.couleur_texte ?? p.b.couleur;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    p.lignes.forEach((ligne, k) => {
      const m = mesurer(ctx, ligne, p.taille, p.graisse, p.approche);
      ctx.fillText(ligne, abscisse(p.b, m), bases[k]);
    });
  }

  // 3. L'élément UnSwipe : icône arrondie, légende dessous.
  if (poseApp) {
    const { cote, ix: ixN, iy: iyN, lignes, s, couleur } = poseApp;
    const rayon = RAYON_ICONE * cote;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ixN + rayon, iyN);
    ctx.arcTo(ixN + cote, iyN, ixN + cote, iyN + cote, rayon);
    ctx.arcTo(ixN + cote, iyN + cote, ixN, iyN + cote, rayon);
    ctx.arcTo(ixN, iyN + cote, ixN, iyN, rayon);
    ctx.arcTo(ixN, iyN, ixN + cote, iyN, rayon);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(icone, ixN, iyN, cote, cote);
    ctx.restore();
    ctx.fillStyle = couleur;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    for (const l of lignes) {
      mesurer(ctx, l.texte, s, 300);
      ctx.fillText(l.texte, l.x, l.base);
    }
  }

  return { jpeg: retirerMetadonnees(await c.encode("jpeg", 92)), avertissements: avert };
}
