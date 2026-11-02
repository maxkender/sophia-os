// Les briques de dessin communes : format, couleurs du compte, formes, et les
// titres géants en Anton (une ligne = un morceau de texte, parfois en bronze).

import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { POLICE } from "./polices.ts";

/** Le format des slides du compte (9:16). */
export const L = 1080;
export const H = 1920;

/** Couleurs relevées sur ses slides (23/10). */
export const COULEUR = {
  /** Le blanc des slides de liste et de la couverture (#fdfdfd). */
  fond: "#fdfdfd",
  /** Le blanc un peu plus gris de la slide de l'appli (#fafafa). */
  fondApp: "#fafafa",
  noir: "#000000",
  /** Le bronze du chiffre et des mots mis en avant (« 4 WAYS », « 6 MONTHS »), en dégradé. */
  bronzeHaut: "#c4823c",
  bronzeBas: "#ad6a2b",
  /** La carte YouTube (appli iOS) : titre, puis chaîne · vues · date. */
  ytTitre: "#0f0f0f",
  ytMeta: "#606060",
  /** Le texte des cartes d'appli et de la slide Sophia. */
  texte: "#0d0d0d",
} as const;

export type Ctx = SKRSContext2D;

export function rectArrondi(ctx: Ctx, x: number, y: number, l: number, h: number, r: number) {
  const rr = Math.min(r, l / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + l - rr, y);
  ctx.arcTo(x + l, y, x + l, y + rr, rr);
  ctx.lineTo(x + l, y + h - rr);
  ctx.arcTo(x + l, y + h, x + l - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function sansOmbre(ctx: Ctx) {
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Une image recadrée pour remplir (`cover`) le rectangle donné. */
export function imageRemplie(ctx: Ctx, img: Image, x: number, y: number, l: number, h: number) {
  const s = Math.max(l / img.width, h / img.height);
  const sl = l / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sl) / 2, (img.height - sh) / 2, sl, sh, x, y, l, h);
}

/**
 * L'icône d'une appli comme sur ses slides : carré arrondi d'iOS (rayon 22 %),
 * ombre douce et liseré gris très clair.
 */
export function icone(ctx: Ctx, img: Image, x: number, y: number, cote: number) {
  const r = cote * 0.225;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.13)";
  ctx.shadowBlur = cote * 0.07;
  ctx.shadowOffsetY = cote * 0.02;
  rectArrondi(ctx, x, y, cote, cote, r);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  sansOmbre(ctx);
  ctx.clip();
  ctx.drawImage(img, x, y, cote, cote);
  ctx.restore();
  ctx.save();
  rectArrondi(ctx, x + 0.5, y + 0.5, cote - 1, cote - 1, r);
  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Un morceau de titre : du texte, en noir sauf s'il est en bronze ou d'une autre couleur. */
export type Morceau = { t: string; bronze?: boolean; couleur?: string };
/** Une ligne de titre : une chaîne (toute noire) ou des morceaux. */
export type LigneTitre = string | Morceau[];

const morceaux = (ligne: LigneTitre): Morceau[] =>
  typeof ligne === "string" ? [{ t: ligne }] : ligne.map((m) => (typeof m === "string" ? { t: m } : m));

/** Hauteur de capitale d'Anton pour une taille de police donnée. */
function hauteurCapitale(ctx: Ctx, taille: number): number {
  ctx.font = `${taille}px "${POLICE.titre}"`;
  return ctx.measureText("H").actualBoundingBoxAscent;
}

function largeurLigne(ctx: Ctx, ligne: LigneTitre, taille: number, espacement: number): number {
  ctx.font = `${taille}px "${POLICE.titre}"`;
  ctx.letterSpacing = `${espacement * taille}px`;
  const l = morceaux(ligne).reduce((s, m) => s + ctx.measureText(m.t.toUpperCase()).width, 0);
  ctx.letterSpacing = "0px";
  return l;
}

/**
 * Ce qui dépasse des capitales d'une ligne, en px : les accents au-dessus
 * (« É », « Ê », « À »), la cédille en dessous (« Ç »). La queue du Q, déjà
 * dans ses slides, ne compte pas.
 */
export function depassements(ctx: Ctx, ligne: LigneTitre, taille: number): { haut: number; bas: number } {
  ctx.save();
  ctx.font = `${taille}px "${POLICE.titre}"`;
  const t = morceaux(ligne).map((m) => m.t.toUpperCase()).join("");
  const cap = ctx.measureText("H").actualBoundingBoxAscent;
  const haut = ctx.measureText(t).actualBoundingBoxAscent - cap;
  const bas = ctx.measureText(t.replace(/Q/g, "")).actualBoundingBoxDescent;
  ctx.restore();
  // Un accent garde un filet de blanc (6 % de la capitale) avant la ligne du dessus.
  // Les lettres rondes débordent de 1 à 2 % : seul un vrai signe (plus de 5 %) compte.
  return { haut: haut > cap * 0.05 ? haut + cap * 0.06 : 0, bas: bas > cap * 0.05 ? bas + cap * 0.06 : 0 };
}

/** L'écart supplémentaire avant la ligne `i` d'un titre, pour ses accents et la cédille de la ligne d'avant. */
export function ecartAccents(ctx: Ctx, lignes: LigneTitre[], i: number, taille: number, tailleAvant = taille): number {
  if (i === 0) return 0;
  return depassements(ctx, lignes[i], taille).haut + depassements(ctx, lignes[i - 1], tailleAvant).bas;
}

export type OptionsTitre = {
  /** Haut des capitales de la première ligne. */
  y: number;
  /** Largeur que la ligne la plus longue occupe (1 040 sur ses slides, presque bord à bord). */
  largeur?: number;
  /** Hauteur de capitale maximale (346 sur ses slides à deux lignes). */
  capMax?: number;
  /** Écart entre deux lignes, en part de la hauteur de capitale (0,055 sur ses slides). */
  interligne?: number;
  /** Lettres un peu serrées comme les siennes (en part de la taille). */
  espacement?: number;
  aligne?: "centre" | "gauche";
  /** Bord gauche quand `aligne` vaut « gauche ». */
  x?: number;
};

/** La taille, la hauteur de capitale et la hauteur totale d'un titre géant, sans le dessiner. */
export function mesurerTitre(ctx: Ctx, lignes: LigneTitre[], o: Omit<OptionsTitre, "y">): { taille: number; cap: number; hauteur: number } {
  const espacement = o.espacement ?? -0.005;
  const ref = 100;
  const capRef = hauteurCapitale(ctx, ref);
  const plusLongue = Math.max(...lignes.map((l) => largeurLigne(ctx, l, ref, espacement)));
  const taille = Math.min((ref * (o.largeur ?? 1040)) / plusLongue, (ref * (o.capMax ?? 346)) / capRef);
  const cap = (capRef * taille) / ref;
  // La cédille de la dernière ligne (« INSATISFAÇÃO ») descend vers la carte : on la compte.
  const accents = lignes.reduce((t, _, i) => t + ecartAccents(ctx, lignes, i, taille), 0) + depassements(ctx, lignes[lignes.length - 1], taille).bas;
  return { taille, cap, hauteur: lignes.length * cap + (lignes.length - 1) * cap * (o.interligne ?? 0.055) + accents };
}

/**
 * Un titre géant en Anton, en capitales : la ligne la plus longue prend toute
 * la largeur (ou la hauteur de capitale plafonne), les autres sont centrées.
 * Renvoie le bas des capitales de la dernière ligne et la hauteur de capitale.
 */
export function titreGeant(ctx: Ctx, lignes: LigneTitre[], o: OptionsTitre): { bas: number; cap: number; taille: number } {
  const largeur = o.largeur ?? 1040;
  const espacement = o.espacement ?? -0.005;
  const ref = 100;
  const capRef = hauteurCapitale(ctx, ref);
  const plusLongue = Math.max(...lignes.map((l) => largeurLigne(ctx, l, ref, espacement)));
  const taille = Math.min((ref * largeur) / plusLongue, (ref * (o.capMax ?? 346)) / capRef);
  const cap = (capRef * taille) / ref;
  const ecart = cap * (o.interligne ?? 0.055);
  ctx.save();
  ctx.font = `${taille}px "${POLICE.titre}"`;
  ctx.letterSpacing = `${espacement * taille}px`;
  ctx.textBaseline = "alphabetic";
  let base = o.y + cap;
  for (const [i, ligne] of lignes.entries()) {
    base += ecartAccents(ctx, lignes, i, taille);
    const l = largeurLigne(ctx, ligne, taille, espacement);
    ctx.font = `${taille}px "${POLICE.titre}"`;
    ctx.letterSpacing = `${espacement * taille}px`;
    let x = o.aligne === "gauche" ? (o.x ?? 20) : (L - l) / 2;
    for (const m of morceaux(ligne)) {
      const t = m.t.toUpperCase();
      if (m.bronze) {
        const g = ctx.createLinearGradient(0, base - cap, 0, base);
        g.addColorStop(0, COULEUR.bronzeHaut);
        g.addColorStop(1, COULEUR.bronzeBas);
        ctx.fillStyle = g;
      } else ctx.fillStyle = m.couleur ?? COULEUR.noir;
      ctx.fillText(t, x, base);
      x += ctx.measureText(t).width;
    }
    base += cap + ecart;
  }
  ctx.restore();
  return { bas: base - cap - ecart + depassements(ctx, lignes[lignes.length - 1], taille).bas, cap, taille };
}

/**
 * Comme `titreGeant`, mais chaque ligne remplit seule la largeur : la
 * couverture (« 5 WAYS TO BE / UNRECOGNISABLE / IN 6 MONTHS »), où une ligne
 * courte grossit. Renvoie le bas des capitales de la dernière ligne.
 */
export function titreAffiche(ctx: Ctx, lignes: LigneTitre[], o: OptionsTitre): number {
  let y = o.y;
  let bas = y;
  let tailleAvant = 0;
  for (const [i, ligne] of lignes.entries()) {
    const m = mesurerTitre(ctx, [ligne], o);
    if (i > 0) y += ecartAccents(ctx, lignes, i, m.taille, tailleAvant);
    const r = titreGeant(ctx, [ligne], { ...o, y });
    bas = r.bas;
    tailleAvant = r.taille;
    y = r.bas + r.cap * (o.interligne ?? 0.12);
  }
  return bas;
}

/** Lignes centrées dans une police donnée ; renvoie le bas de la dernière ligne. */
export function lignesCentrees(
  ctx: Ctx,
  lignes: string[],
  o: { y: number; police: string; taille: number; pas: number; couleur: string; largeurMax?: number },
): number {
  ctx.save();
  ctx.font = `${o.taille}px "${o.police}"`;
  ctx.fillStyle = o.couleur;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let base = o.y;
  for (const t of lignes) {
    ctx.fillText(t, L / 2, base, o.largeurMax);
    base += o.pas;
  }
  ctx.restore();
  return base - o.pas;
}
