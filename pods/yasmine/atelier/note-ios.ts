// La note de l'app Notes d'iOS posée sur une photo (« things i do to SMASH
// EVERY EXAM ») : carte blanche arrondie, barre d'état, boutons ronds, puis
// un titre (emoji collé) et un paragraphe. Mesuré sur ses slides (1080 × 1920,
// carte de 664 px de large, posée à x 108 ou x 308).

import { type Ctx, rectArrondi, sansOmbre } from "./dessin.ts";
import { EMOJIS, POLICE } from "./polices.ts";

export type NoteIos = {
  /** Le bord gauche de la carte (108 ou 308 chez elle) et son haut. */
  x: number;
  y: number;
  /** Le titre, emoji collé (« study early🌸 ») ; absent : la note n'a qu'un paragraphe. */
  titre?: string;
  /** Le paragraphe, coupé tout seul à la largeur de la note ; absent : la note n'a qu'un titre (« or mindmaps💭 »). */
  texte?: string;
  /** Texte plus gros et plus gras (« school tips » : 44 px, une ligne tous les 56 px), comme une note zoomée. */
  grand?: boolean;
};

const LARGEUR = 664;
const ENCRE = "#333334";
/** Le titre et le paragraphe : 41 et 37 px, une ligne tous les 47 px (mesuré). */
const TAILLE_TITRE_NORMAL = 41;
const TAILLE_TEXTE = 37;
const PAS_NORMAL = 47;
const MARGE = 46;

/** Coupe le texte à la largeur ; un saut de ligne ouvre un nouveau paragraphe, après une ligne vide. */
function lignes(ctx: Ctx, texte: string, largeur: number): string[] {
  const paragraphes = texte.split("\n").filter((p) => p.trim());
  if (paragraphes.length > 1) return paragraphes.flatMap((p, i) => [...(i ? [""] : []), ...lignes(ctx, p, largeur)]);
  const sortie: string[] = [];
  let ligne = "";
  // Coupé aux seules espaces : une espace insécable (« 10 h ») ne se coupe pas.
  for (const mot of texte.split(/ +/).filter(Boolean)) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(essai).width > largeur && ligne) {
      sortie.push(ligne);
      ligne = mot;
    } else ligne = essai;
  }
  if (ligne) sortie.push(ligne);
  return sortie;
}

/** Un bouton rond (ou une pilule) en verre clair, ombre très douce. */
function bouton(ctx: Ctx, x: number, y: number, l: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.07)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;
  rectArrondi(ctx, x, y, l, h, h / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  sansOmbre(ctx);
  ctx.strokeStyle = "rgba(0,0,0,0.035)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function trait(ctx: Ctx, points: [number, number][], epaisseur: number) {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.lineWidth = epaisseur;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function barreEtat(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = "#0b0b0c";
  ctx.strokeStyle = "#0b0b0c";
  // L'heure, et la flèche de localisation.
  ctx.font = `31px "${POLICE.tiktok}"`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("1:23", x + 63, y + 55);
  ctx.beginPath();
  ctx.moveTo(x + 149, y + 33);
  ctx.lineTo(x + 130, y + 43);
  ctx.lineTo(x + 139, y + 44);
  ctx.lineTo(x + 140, y + 53);
  ctx.closePath();
  ctx.fill();
  // Le réseau : 4 barres, les deux dernières grises.
  [8, 12, 16, 20].forEach((h, i) => {
    ctx.fillStyle = i < 2 ? "#0b0b0c" : "#c7c7cc";
    rectArrondi(ctx, x + 487 + i * 9, y + 54 - h, 6, h, 1.5);
    ctx.fill();
  });
  // Le wifi : trois arcs et un point.
  ctx.fillStyle = "#0b0b0c";
  const cx = x + 546;
  const cy = y + 54;
  for (const r of [7, 14, 21]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.lineWidth = 4.2;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy - 1.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // La batterie, pleine à 91 %, le chiffre en blanc dedans.
  rectArrondi(ctx, x + 573, y + 34, 38, 21, 6);
  ctx.fill();
  rectArrondi(ctx, x + 612, y + 41, 3, 7, 1.5);
  ctx.fillStyle = "#9a9a9e";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `17px "${POLICE.tiktok}"`;
  ctx.textAlign = "center";
  ctx.fillText("91", x + 592, y + 51);
  ctx.restore();
}

function barreOutils(ctx: Ctx, x: number, y: number) {
  const cy = y + 115;
  bouton(ctx, x + 25, cy - 40, 80, 80);
  bouton(ctx, x + 370, cy - 40, 80, 80);
  bouton(ctx, x + 466, cy - 40, 176, 80);
  ctx.save();
  ctx.strokeStyle = "#1c1c1e";
  ctx.fillStyle = "#1c1c1e";
  // Retour.
  trait(ctx, [[x + 71, cy - 16], [x + 55, cy], [x + 71, cy + 16]], 4.2);
  // Annuler : flèche courbe.
  ctx.beginPath();
  ctx.moveTo(x + 400, cy - 6);
  ctx.lineTo(x + 418, cy - 6);
  ctx.bezierCurveTo(x + 432, cy - 6, x + 432, cy + 16, x + 418, cy + 16);
  ctx.lineTo(x + 410, cy + 16);
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.stroke();
  trait(ctx, [[x + 408, cy - 15], [x + 399, cy - 6], [x + 408, cy + 3]], 3.6);
  // Partager : boîte ouverte et flèche vers le haut.
  trait(ctx, [[x + 502, cy - 6], [x + 495, cy - 6], [x + 495, cy + 17], [x + 521, cy + 17], [x + 521, cy - 6], [x + 514, cy - 6]], 3.4);
  trait(ctx, [[x + 508, cy + 4], [x + 508, cy - 20]], 3.4);
  trait(ctx, [[x + 500, cy - 12], [x + 508, cy - 20], [x + 516, cy - 12]], 3.4);
  // Plus.
  for (const dx of [-12, 0, 12]) {
    ctx.beginPath();
    ctx.arc(x + 600 + dx, cy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Dessine la note ; rend sa boîte. */
export function noteIos(ctx: Ctx, n: NoteIos) {
  if (!EMOJIS && /\p{Extended_Pictographic}/u.test(`${n.titre ?? ""}${n.texte ?? ""}`)) {
    throw new Error("police d'emojis introuvable (Noto Color Emoji) : les emojis ne se dessineraient pas");
  }
  const police = n.grand ? POLICE.tiktok : POLICE.modele;
  const TAILLE = n.grand ? 44 : TAILLE_TEXTE;
  const TAILLE_TITRE = n.grand ? 44 : TAILLE_TITRE_NORMAL;
  const PAS = n.grand ? 56 : PAS_NORMAL;
  ctx.save();
  ctx.font = `${TAILLE}px "${police}", "${POLICE.emoji}"`;
  const corps = n.texte ? lignes(ctx, n.texte, LARGEUR - 2 * MARGE + 6) : [];
  ctx.font = `${TAILLE_TITRE}px "${police}", "${POLICE.emoji}"`;
  const titre = n.titre ? lignes(ctx, n.titre, LARGEUR - 2 * MARGE + 6) : [];
  if (!titre.length && !corps.length) throw new Error("note sans titre ni texte");
  const base0 = n.y + (n.grand ? 215 : 207);
  // Un blanc d'une ligne entre le titre et le paragraphe, comme dans l'app Notes.
  const premiere = titre.length ? base0 + (titre.length + 1) * PAS : base0;
  const derniere = corps.length ? premiere + (corps.length - 1) * PAS : base0 + (titre.length - 1) * PAS;
  const h = derniere + 59 - n.y;
  if (n.x < 0 || n.x + LARGEUR > 1080 || n.y + h > 1880) throw new Error(`note « ${n.titre} » : sort de la slide`);
  // La carte.
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 6;
  rectArrondi(ctx, n.x, n.y, LARGEUR, h, 52);
  ctx.fillStyle = "#fefefe";
  ctx.fill();
  sansOmbre(ctx);
  barreEtat(ctx, n.x, n.y);
  barreOutils(ctx, n.x, n.y);
  ctx.fillStyle = ENCRE;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = `${-TAILLE * (n.grand ? 0.02 : 0.01)}px`;
  ctx.font = `${TAILLE_TITRE}px "${police}", "${POLICE.emoji}"`;
  titre.forEach((l, i) => ctx.fillText(l, n.x + MARGE, base0 + i * PAS));
  ctx.font = `${TAILLE}px "${police}", "${POLICE.emoji}"`;
  corps.forEach((l, i) => ctx.fillText(l, n.x + MARGE, premiere + i * PAS));
  ctx.restore();
  return { x: n.x, y: n.y, l: LARGEUR, h };
}
