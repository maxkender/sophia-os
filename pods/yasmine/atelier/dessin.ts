// Les briques de dessin communes : format, couleurs du compte, formes, fond
// photo, légendes jaunes et titre de couverture.

import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { EMOJIS, POLICE } from "./polices.ts";

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
  /** Les petites légendes TikTok des slides photo : jaune pâle sur les photos sombres… */
  tiktok_jaune: "#fdf2ab",
  /** … brun foncé sur les photos claires (mesurés sur « after school routine »). */
  tiktok_brun: "#3d2c28",
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

/** Une photo qui remplit une bande horizontale de la slide (collage haut / bas, « older sister advice »). */
export function fondBande(ctx: Ctx, img: Image, y: number, h: number, cadrage: Cadrage = {}) {
  const s = Math.max(L / img.width, h / img.height) * (cadrage.zoom ?? 1);
  const lw = img.width * s;
  const lh = img.height * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, L, h);
  ctx.clip();
  ctx.drawImage(img, (L - lw) * (cadrage.x ?? 0.5), y + (h - lh) * (cadrage.y ?? 0.5), lw, lh);
  ctx.restore();
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
  /** « centre » : chaque ligne centrée, sans escalier (« after school routine », 174 px). */
  aligne?: "escalier" | "centre";
  /** Taille de l'écriture fine (par défaut 0,55 × le titre). */
  taille_script?: number;
  /** Sous le titre, en texte TikTok blanc calé à gauche du titre (« for a peaceful life🌙 »). */
  texte_bas?: string;
  /** Le texte du bas : centre en x (sinon calé sur le bord gauche du titre), taille. */
  texte_bas_x?: number;
  texte_bas_taille?: number;
  /** L'interligne du titre, en fraction de la taille (0,82 pour « productivity apps », en minuscules). */
  interligne?: number;
  /** Des lignes d'écriture fine posées librement (« from a highschool / graduate ») : ligne de base et bord gauche. */
  script_lignes?: { texte: string; x: number; y: number }[];
  /** Remonte l'écriture fine du haut (px), quand la première ligne porte un accent (« RÉUSSIR »). */
  script_monte?: number;
  /** Centré : l'écriture fine au-dessus, centrée (par défaut) ou calée sur le bord gauche du titre. */
  script_place?: "centre" | "gauche";
};

/** Le titre de couverture : capitales jaunes en escalier, écriture fine blanche. */
export function titreCouverture(ctx: Ctx, c: Couverture) {
  const taille = c.taille ?? 124;
  const centre = c.aligne === "centre";
  // Centré, ses lignes se touchent presque : une ligne tous les 1,0 × la taille.
  const interligne = Math.round(taille * (c.interligne ?? (centre ? 1.0 : 1.07)));
  const y0 = c.y ?? 712;
  const decalages = c.decalages ?? [135, 300, 330];
  const tailleScript = c.taille_script ?? Math.round(taille * 0.55);
  ctx.save();
  ctx.font = `${taille}px "${POLICE.titre}"`;
  ctx.letterSpacing = `${-taille * 0.012}px`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COULEUR.jaune;
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 18;
  let droite = 0;
  let gauche = L;
  c.lignes.forEach((ligne, i) => {
    const l = ctx.measureText(ligne).width;
    const x = centre ? Math.round(L / 2 - l / 2) : decalages[Math.min(i, decalages.length - 1)];
    if (x < 40 || x + l > L - 40) throw new Error(`couverture : « ${ligne} » déborde`);
    ctx.fillText(ligne, x, y0 + i * interligne);
    droite = Math.max(droite, x + l);
    gauche = Math.min(gauche, x);
  });
  ctx.letterSpacing = "0px";
  sansOmbre(ctx);
  const script = (texte: string, x: number, y: number, align: "left" | "right" | "center") => {
    ctx.save();
    ctx.font = `${tailleScript}px "${POLICE.script}"`;
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
  if (c.script_haut) {
    if (centre && c.script_place === "gauche") script(c.script_haut, gauche + 24, y0 - taille * 0.78, "left");
    else if (centre) script(c.script_haut, L / 2 + tailleScript * 0.12, y0 - taille * 1.02 - (c.script_monte ?? 0), "center");
    else script(c.script_haut, decalages[0] + 8, y0 - taille * 0.98, "left");
  }
  for (const l of c.script_lignes ?? []) script(l.texte, l.x, l.y, "left");
  if (c.script_bas) script(c.script_bas, droite + 20, y0 + (c.lignes.length - 1) * interligne + taille * 0.68, "right");
  if (c.texte_bas) {
    const tb = c.texte_bas_taille ?? Math.round(taille * 0.24);
    const yb = y0 + (c.lignes.length - 1) * interligne + Math.round(taille * 0.5);
    if (c.texte_bas_x) texteTiktok(ctx, [c.texte_bas], { x: c.texte_bas_x, y: yb, taille: tb, couleur: "#ffffff", aligne: "centre" });
    else texteTiktok(ctx, [c.texte_bas], { x: gauche + 12, y: yb, taille: tb, couleur: "#ffffff", aligne: "gauche" });
  }
  ctx.restore();
}

/** Une petite légende posée sur une slide photo, comme le texte natif de TikTok. */
export type LegendePhoto = {
  /** Les lignes, emojis compris (« prends un goûter🥨 »). */
  lignes: string[];
  /** Des lignes plus petites dessous (« aim for 2 hours a day⏰ »). */
  sous?: string[];
  /** Centre du texte (ou son bord gauche si `aligne` vaut « gauche »). 540 par défaut. */
  x?: number;
  /** Ligne de base de la première ligne. */
  y: number;
  /** 36 à 62 px chez elle, selon la slide. */
  taille?: number;
  taille_sous?: number;
  /** « jaune » sur une photo sombre, « brun » sur une photo claire. */
  couleur?: "jaune" | "brun" | "blanc";
  aligne?: "centre" | "gauche";
};

type PlaceTiktok = { x: number; y: number; taille: number; couleur: string; aligne: "centre" | "gauche" };

/**
 * Le texte natif de TikTok : TikTok Sans SemiBold, approche serrée
 * (−0,025 em), pas d'ombre, emojis en couleur. Rend la ligne de base suivante.
 */
function texteTiktok(ctx: Ctx, lignes: string[], p: PlaceTiktok): number {
  if (!EMOJIS && lignes.some((l) => /\p{Extended_Pictographic}/u.test(l))) {
    throw new Error("police d'emojis introuvable (Noto Color Emoji) : les emojis ne se dessineraient pas");
  }
  ctx.save();
  ctx.font = `${p.taille}px "${POLICE.tiktok}", "${POLICE.emoji}"`;
  ctx.letterSpacing = `${-p.taille * 0.025}px`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = p.couleur;
  sansOmbre(ctx);
  const interligne = Math.round(p.taille * 1.18);
  let y = p.y;
  for (const ligne of lignes) {
    const l = ctx.measureText(ligne).width;
    const x = p.aligne === "gauche" ? p.x : Math.round(p.x - l / 2);
    if (x < 40 || x + l > L - 40) throw new Error(`légende : « ${ligne} » déborde de la slide`);
    ctx.fillText(ligne, x, y);
    y += interligne;
  }
  ctx.restore();
  return y;
}

/** La légende d'une slide photo : ses lignes, puis les petites lignes dessous. */
export function legendePhoto(ctx: Ctx, l: LegendePhoto) {
  const couleur = l.couleur === "brun" ? COULEUR.tiktok_brun : l.couleur === "blanc" ? "#ffffff" : COULEUR.tiktok_jaune;
  const taille = l.taille ?? 52;
  const base = { x: l.x ?? L / 2, couleur, aligne: l.aligne ?? "centre" } as const;
  const suivante = texteTiktok(ctx, l.lignes, { ...base, y: l.y, taille });
  if (l.sous?.length) {
    const ts = l.taille_sous ?? Math.round(taille * 0.62);
    texteTiktok(ctx, l.sous, { ...base, y: suivante - Math.round(taille * 1.18) + Math.round(ts * 1.3), taille: ts });
  }
}
