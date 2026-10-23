// Les briques de dessin communes : format, couleurs du compte, formes, fond
// photo, légendes jaunes et titre de couverture.

import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { POLICE } from "./polices.ts";

/** Le format des slides du compte (9:16). */
export const L = 1080;
export const H = 1920;

/** Couleurs relevées sur ses slides. */
export const COULEUR = {
  /** Le jaune pâle du titre et des légendes (#fef79d sur la couverture). */
  jaune: "#fef79d",
  /** Le bleu marine des modèles de notes. */
  marine: "#1c2b4b",
  /** Le surligneur jaune des notes (#fde79c). */
  surligneur: "#fde79c",
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

export type Cadrage = {
  /** 0 = bord gauche de la photo, 1 = bord droit (0,5 = centré). */
  x?: number;
  y?: number;
  /** Zoom au-delà du remplissage (1 = juste rempli). */
  zoom?: number;
};

/**
 * La photo de fond, recadrée pour remplir la slide. Les slides intérieures du
 * compte sont la même photo assombrie d'environ 30 % (mesuré : × 0,71).
 */
export function fond(ctx: Ctx, img: Image, cadrage: Cadrage = {}, assombrir = 0) {
  const s = Math.max(L / img.width, H / img.height) * (cadrage.zoom ?? 1);
  const l = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (L - l) * (cadrage.x ?? 0.5), (H - h) * (cadrage.y ?? 0.5), l, h);
  if (assombrir > 0) {
    ctx.fillStyle = `rgba(0,0,0,${assombrir})`;
    ctx.fillRect(0, 0, L, H);
  }
}

/** Ombre douce des textes jaunes, comme sur ses slides. */
function ombreTexte(ctx: Ctx) {
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
}

/** Taille qui fait tenir chaque ligne dans `largeur`, sans dépasser `taille`. */
function tailleQuiTient(ctx: Ctx, lignes: string[], police: string, taille: number, largeur: number) {
  let t = taille;
  for (;;) {
    ctx.font = `${t}px "${police}"`;
    if (lignes.every((l) => ctx.measureText(l).width <= largeur) || t <= 20) return t;
    t -= 1;
  }
}

/**
 * Légende jaune centrée. `bas` : la ligne de base de la DERNIÈRE ligne (pour
 * une légende au-dessus de l'appareil) ; `haut` : celle de la première (pour
 * une légende au-dessous).
 */
export function legende(ctx: Ctx, lignes: string[], place: { bas: number } | { haut: number }, taille = 48) {
  if (!lignes.length) return;
  ctx.save();
  const t = tailleQuiTient(ctx, lignes, POLICE.legende, taille, 960);
  const interligne = Math.round(t * 1.04);
  const premiere = "bas" in place ? place.bas - (lignes.length - 1) * interligne : place.haut;
  ctx.font = `${t}px "${POLICE.legende}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COULEUR.jaune;
  ombreTexte(ctx);
  lignes.forEach((l, i) => ctx.fillText(l, L / 2, premiere + i * interligne));
  ctx.restore();
}

export type Couverture = {
  /** L'écriture fine au-dessus du titre (« comment je »). */
  script_haut?: string;
  /** Les lignes du titre jaune, en capitales. */
  lignes: string[];
  /** Le décalage à droite de chaque ligne, comme le titre en escalier du compte. */
  decalages?: number[];
  /** L'écriture fine sous le titre (« pour chaque matière »), calée à droite. */
  script_bas?: string;
  /** La ligne de base de la première ligne du titre. */
  y?: number;
  /** Taille du titre (124 px chez elle). */
  taille?: number;
};

/** Le titre de couverture : capitales jaunes en escalier, écriture fine blanche. */
export function titreCouverture(ctx: Ctx, c: Couverture) {
  const taille = c.taille ?? 124;
  const interligne = Math.round(taille * 1.07);
  const y0 = c.y ?? 712;
  const decalages = c.decalages ?? [135, 300, 330];
  ctx.save();
  ctx.font = `${taille}px "${POLICE.titre}"`;
  ctx.letterSpacing = `${-taille * 0.012}px`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COULEUR.jaune;
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 18;
  let droite = 0;
  c.lignes.forEach((ligne, i) => {
    const x = decalages[Math.min(i, decalages.length - 1)];
    ctx.fillText(ligne, x, y0 + i * interligne);
    droite = Math.max(droite, x + ctx.measureText(ligne).width);
  });
  ctx.letterSpacing = "0px";
  sansOmbre(ctx);
  const script = (texte: string, x: number, y: number, align: "left" | "right") => {
    ctx.save();
    ctx.font = `${Math.round(taille * 0.55)}px "${POLICE.script}"`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 8;
    ctx.translate(x, y);
    // Son écriture penche un peu à droite : on incline la police (≈ 8°).
    ctx.transform(1, 0, -0.14, 1, 0, 0);
    ctx.textAlign = align;
    ctx.fillText(texte, 0, 0);
    ctx.restore();
  };
  if (c.script_haut) script(c.script_haut, decalages[0] + 8, y0 - taille * 0.98, "left");
  if (c.script_bas) script(c.script_bas, droite + 20, y0 + (c.lignes.length - 1) * interligne + taille * 0.68, "right");
  ctx.restore();
}
