// Les écrans d'iPhone du format « how I ORGANISE MY PHONE » : verrouillage,
// accueil à widgets, vue Aujourd'hui, centre de contrôle, modes de
// concentration. Dessinés à 739 × 1600 (les proportions des captures de
// micabo), puis posés dans l'iPhone d'une slide photo (`capture`).

import { createCanvas, type Image } from "@napi-rs/canvas";
import { type Ctx, rectArrondi } from "./dessin.ts";
import { POLICE } from "./polices.ts";

export const LARGEUR = 739;
export const HAUTEUR = 1600;
/** Un point iOS en pixels de l'écran (393 points de large). */
const P = LARGEUR / 393;

export type TextesIos = {
  date: string;
  heure: string;
  titre_musique: string;
  artiste: string;
  meteo_ville: string;
  meteo_ciel: string;
  widget_micabo: [string, string];
  apps: Record<string, string>;
  jours: { nom: string; taches: string[] }[];
  mois: string;
  focus_titre: string;
  focus: [string, string][];
  focus_nouveau: string;
  revisions: string;
};

type Icones = Record<string, Image>;

function police(taille: number, famille: string = POLICE.modele) {
  return `${taille}px "${famille}", "${POLICE.emoji}"`;
}

function texte(ctx: Ctx, t: string, x: number, y: number, taille: number, couleur: string, aligne: CanvasTextAlign = "left", famille?: string) {
  ctx.font = police(taille, famille);
  ctx.fillStyle = couleur;
  ctx.textAlign = aligne;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(t, x, y);
}

/** Le fond d'écran couvre tout l'écran ; flou et assombri pour les écrans « derrière ». */
function fondEcran(ctx: Ctx, img: Image, flou = 0, voile = 0) {
  const s = Math.max(LARGEUR / img.width, HAUTEUR / img.height) * (flou ? 1.08 : 1);
  const l = img.width * s;
  const h = img.height * s;
  ctx.save();
  if (flou) ctx.filter = `blur(${flou}px)`;
  ctx.drawImage(img, (LARGEUR - l) / 2, (HAUTEUR - h) / 2, l, h);
  ctx.restore();
  if (voile) {
    ctx.fillStyle = `rgba(0,0,0,${voile})`;
    ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
  }
}

function barreEtat(ctx: Ctx, heure: string, clair = true) {
  const c = clair ? "#ffffff" : "#111111";
  texte(ctx, heure, 32 * P, 22 * P, 16 * P, c, "left");
  // Réseau, wifi, batterie.
  ctx.fillStyle = c;
  for (let i = 0; i < 4; i++) ctx.fillRect(LARGEUR - 104 * P + i * 5 * P, 22 * P - (4 + i * 2.5) * P, 3.2 * P, (4 + i * 2.5) * P);
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.6 * P;
  rectArrondi(ctx, LARGEUR - 58 * P, 11 * P, 25 * P, 12 * P, 3.5 * P);
  ctx.stroke();
  rectArrondi(ctx, LARGEUR - 56 * P, 13 * P, 17 * P, 8 * P, 2 * P);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(LARGEUR - 72 * P, 23 * P, 9 * P, Math.PI * 1.25, Math.PI * 1.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(LARGEUR - 72 * P, 23 * P, 5 * P, Math.PI * 1.25, Math.PI * 1.75);
  ctx.stroke();
}

function verre(ctx: Ctx, x: number, y: number, l: number, h: number, r: number, opacite = 0.22, sombre = false) {
  rectArrondi(ctx, x, y, l, h, r);
  ctx.fillStyle = sombre ? `rgba(20,20,24,${opacite})` : `rgba(255,255,255,${opacite})`;
  ctx.fill();
}

function icone(ctx: Ctx, img: Image | null, emoji: string | null, fondIcone: string, x: number, y: number, c: number) {
  ctx.save();
  rectArrondi(ctx, x, y, c, c, c * 0.225);
  ctx.clip();
  if (img) ctx.drawImage(img, x, y, c, c);
  else {
    ctx.fillStyle = fondIcone;
    ctx.fillRect(x, y, c, c);
    ctx.font = police(c * 0.56, POLICE.emoji);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji ?? "", x + c / 2, y + c / 2 + c * 0.04);
  }
  ctx.restore();
}

function controles(ctx: Ctx, cx: number, y: number, e: number, couleur: string) {
  ctx.fillStyle = couleur;
  const tri = (x: number, gauche: boolean) => {
    ctx.beginPath();
    if (gauche) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + e, y - e * 0.6);
      ctx.lineTo(x + e, y + e * 0.6);
    } else {
      ctx.moveTo(x + e, y);
      ctx.lineTo(x, y - e * 0.6);
      ctx.lineTo(x, y + e * 0.6);
    }
    ctx.closePath();
    ctx.fill();
  };
  tri(cx - 3.2 * e, true);
  tri(cx - 2.3 * e, true);
  ctx.fillRect(cx - e * 0.45, y - e * 0.65, e * 0.32, e * 1.3);
  ctx.fillRect(cx + e * 0.13, y - e * 0.65, e * 0.32, e * 1.3);
  tri(cx + 1.3 * e, false);
  tri(cx + 2.2 * e, false);
}

export function verrouillage(fondImg: Image, t: TextesIos) {
  const cv = createCanvas(LARGEUR, HAUTEUR);
  const ctx = cv.getContext("2d");
  fondEcran(ctx, fondImg);
  const g = ctx.createLinearGradient(0, 0, 0, HAUTEUR * 0.45);
  g.addColorStop(0, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
  barreEtat(ctx, "");
  texte(ctx, t.date, LARGEUR / 2, 92 * P, 21 * P, "rgba(255,255,255,0.92)", "center");
  texte(ctx, t.heure, LARGEUR / 2, 192 * P, 104 * P, "rgba(255,255,255,0.94)", "center", POLICE.titre);
  // Deux petits widgets sous l'heure : le quiz micabo du jour et la météo.
  verre(ctx, 52 * P, 214 * P, 138 * P, 58 * P, 18 * P, 0.2);
  texte(ctx, `📚 ${t.widget_micabo[0]}`, 64 * P, 238 * P, 13 * P, "#ffffff");
  texte(ctx, t.widget_micabo[1], 64 * P, 259 * P, 15 * P, "#ffffff", "left", POLICE.titre);
  verre(ctx, 203 * P, 214 * P, 138 * P, 58 * P, 18 * P, 0.2);
  texte(ctx, `🌤️ ${t.meteo_ville}`, 215 * P, 238 * P, 13 * P, "#ffffff");
  texte(ctx, `16° · ${t.meteo_ciel}`, 215 * P, 259 * P, 15 * P, "#ffffff", "left", POLICE.titre);
  // Le lecteur de musique.
  verre(ctx, 14 * P, 560 * P, 365 * P, 150 * P, 26 * P, 0.32, true);
  rectArrondi(ctx, 30 * P, 578 * P, 46 * P, 46 * P, 8 * P);
  ctx.fillStyle = "#d8c3a5";
  ctx.fill();
  texte(ctx, "🎧", 53 * P, 610 * P, 24 * P, "#000", "center");
  texte(ctx, t.titre_musique, 88 * P, 598 * P, 15 * P, "#ffffff", "left");
  texte(ctx, t.artiste, 88 * P, 618 * P, 13 * P, "rgba(255,255,255,0.65)", "left");
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  rectArrondi(ctx, 30 * P, 640 * P, 333 * P, 5 * P, 2.5 * P);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  rectArrondi(ctx, 30 * P, 640 * P, 120 * P, 5 * P, 2.5 * P);
  ctx.fill();
  controles(ctx, LARGEUR / 2, 680 * P, 13 * P, "#ffffff");
  // Lampe et appareil photo.
  for (const [x, e] of [[62, "🔦"], [331, "📷"]] as const) {
    ctx.beginPath();
    ctx.arc(x * P, 790 * P, 26 * P, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,20,24,0.45)";
    ctx.fill();
    texte(ctx, e, x * P, 798 * P, 20 * P, "#fff", "center");
  }
  ctx.fillStyle = "#ffffff";
  rectArrondi(ctx, LARGEUR / 2 - 67 * P, 838 * P, 134 * P, 5 * P, 2.5 * P);
  ctx.fill();
  return cv;
}

export function accueil(fondImg: Image, t: TextesIos, ic: Icones) {
  const cv = createCanvas(LARGEUR, HAUTEUR);
  const ctx = cv.getContext("2d");
  fondEcran(ctx, fondImg, 0, 0.12);
  barreEtat(ctx, t.heure);
  // Le widget micabo (2 × 2) et la météo (2 × 2).
  verre(ctx, 24 * P, 66 * P, 164 * P, 164 * P, 26 * P, 0.86);
  icone(ctx, ic.micabo, null, "", 38 * P, 80 * P, 42 * P);
  texte(ctx, "micabo", 38 * P, 148 * P, 15 * P, "#1c1c1e", "left", POLICE.titre);
  texte(ctx, t.widget_micabo[0], 38 * P, 170 * P, 13 * P, "#5b5b60");
  ctx.fillStyle = "#e7e3ef";
  rectArrondi(ctx, 38 * P, 186 * P, 136 * P, 9 * P, 4.5 * P);
  ctx.fill();
  ctx.fillStyle = "#e24c8a";
  rectArrondi(ctx, 38 * P, 186 * P, 92 * P, 9 * P, 4.5 * P);
  ctx.fill();
  texte(ctx, t.widget_micabo[1], 38 * P, 215 * P, 13 * P, "#1c1c1e", "left", POLICE.titre);
  verre(ctx, 205 * P, 66 * P, 164 * P, 164 * P, 26 * P, 0.24, true);
  texte(ctx, t.meteo_ville, 219 * P, 92 * P, 15 * P, "#ffffff", "left", POLICE.titre);
  texte(ctx, "16°", 219 * P, 140 * P, 42 * P, "#ffffff", "left");
  texte(ctx, "🌤️", 219 * P, 182 * P, 18 * P, "#fff");
  texte(ctx, t.meteo_ciel, 219 * P, 208 * P, 13 * P, "#ffffff");
  // Les applis, 4 par rangée, avec leur nom.
  const grille: [string, string | null, string][] = [
    ["notion", null, "#ffffff"],
    ["focuspomo", null, "#ffffff"],
    ["calendrier", null, "#ffffff"],
    ["notes", "📝", "#fbe46b"],
    ["photos", "🌸", "#ffffff"],
    ["livres", "📚", "#ff9f0a"],
    ["sophia", null, "#ffffff"],
    ["unswipe", null, "#ffffff"],
  ];
  const c = 62 * P;
  grille.forEach(([cle, emoji, f], i) => {
    const x = (28 + (i % 4) * 89) * P;
    const y = (262 + Math.floor(i / 4) * 102) * P;
    icone(ctx, ic[cle] ?? null, emoji, f, x, y, c);
    texte(ctx, t.apps[cle], x + c / 2, y + c + 16 * P, 11.5 * P, "#ffffff", "center");
  });
  // La recherche et le dock.
  verre(ctx, LARGEUR / 2 - 45 * P, 712 * P, 90 * P, 28 * P, 14 * P, 0.3, true);
  texte(ctx, `🔍 ${t.apps.recherche}`, LARGEUR / 2, 731 * P, 12 * P, "#ffffff", "center");
  verre(ctx, 14 * P, 754 * P, 365 * P, 88 * P, 32 * P, 0.28);
  const dock: [string, string][] = [["📞", "#34c759"], ["💬", "#34c759"], ["🧭", "#0a84ff"], ["🎵", "#ff375f"]];
  dock.forEach(([e, f], i) => icone(ctx, null, e, f, (28 + i * 89) * P, 767 * P, c));
  return cv;
}

export function aujourdhui(fondImg: Image, t: TextesIos) {
  const cv = createCanvas(LARGEUR, HAUTEUR);
  const ctx = cv.getContext("2d");
  fondEcran(ctx, fondImg, 28, 0.18);
  barreEtat(ctx, t.heure);
  // Le calendrier du mois et le temps de révision.
  verre(ctx, 24 * P, 62 * P, 164 * P, 164 * P, 26 * P, 0.24);
  texte(ctx, t.mois.toUpperCase(), 38 * P, 86 * P, 11 * P, "#ffffff", "left", POLICE.titre);
  const jours = ["L", "M", "M", "J", "V", "S", "D"];
  jours.forEach((j, i) => texte(ctx, j, (44 + i * 20) * P, 106 * P, 9 * P, "rgba(255,255,255,0.75)", "center"));
  for (let n = 1; n <= 30; n++) {
    const pos = n + 5;
    const x = (44 + (pos % 7) * 20) * P;
    const y = (124 + Math.floor(pos / 7) * 19) * P;
    if (n === 4) {
      ctx.beginPath();
      ctx.arc(x, y - 3.5 * P, 8.5 * P, 0, Math.PI * 2);
      ctx.fillStyle = "#ff453a";
      ctx.fill();
    }
    texte(ctx, String(n), x, y, 9.5 * P, "#ffffff", "center");
  }
  verre(ctx, 205 * P, 62 * P, 164 * P, 164 * P, 26 * P, 0.24);
  texte(ctx, t.revisions, 219 * P, 88 * P, 13 * P, "#ffffff", "left", POLICE.titre);
  texte(ctx, "2 h 40", 219 * P, 128 * P, 30 * P, "#ffffff", "left");
  for (let i = 0; i < 7; i++) {
    const h = [30, 46, 22, 58, 40, 12, 0][i] * P;
    ctx.fillStyle = i === 3 ? "#ffffff" : "rgba(255,255,255,0.5)";
    rectArrondi(ctx, (221 + i * 20) * P, 208 * P - h, 11 * P, Math.max(h, 3 * P), 3 * P);
    ctx.fill();
  }
  // Les rappels de la semaine, deux par rangée.
  t.jours.forEach((j, i) => {
    const x = (24 + (i % 2) * 181) * P;
    const y = (244 + Math.floor(i / 2) * 178) * P;
    verre(ctx, x, y, 164 * P, 164 * P, 26 * P, 0.24);
    texte(ctx, j.nom, x + 14 * P, y + 28 * P, 14 * P, "#ffffff", "left", POLICE.titre);
    texte(ctx, String(j.taches.length), x + 150 * P, y + 28 * P, 16 * P, "#ffffff", "right", POLICE.titre);
    j.taches.forEach((tache, k) => {
      const ty = y + (58 + k * 30) * P;
      ctx.beginPath();
      ctx.arc(x + 22 * P, ty - 4 * P, 7 * P, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.4 * P;
      ctx.stroke();
      texte(ctx, tache, x + 36 * P, ty, 11.5 * P, "#ffffff");
    });
  });
  return cv;
}

export function centreControle(fondImg: Image, t: TextesIos) {
  const cv = createCanvas(LARGEUR, HAUTEUR);
  const ctx = cv.getContext("2d");
  fondEcran(ctx, fondImg, 34, 0.42);
  barreEtat(ctx, "");
  const rond = (x: number, y: number, e: string, actif = false, couleur = "#ffffff") => {
    ctx.beginPath();
    ctx.arc(x * P, y * P, 30 * P, 0, Math.PI * 2);
    ctx.fillStyle = actif ? couleur : "rgba(255,255,255,0.18)";
    ctx.fill();
    texte(ctx, e, x * P, (y + 8) * P, 22 * P, "#000", "center");
  };
  // La musique en grand.
  verre(ctx, 24 * P, 86 * P, 164 * P, 164 * P, 30 * P, 0.18);
  rectArrondi(ctx, 40 * P, 102 * P, 52 * P, 52 * P, 10 * P);
  ctx.fillStyle = "#d8c3a5";
  ctx.fill();
  texte(ctx, "🎧", 66 * P, 138 * P, 26 * P, "#000", "center");
  texte(ctx, t.titre_musique, 40 * P, 186 * P, 13 * P, "#ffffff");
  texte(ctx, t.artiste, 40 * P, 204 * P, 11 * P, "rgba(255,255,255,0.65)");
  controles(ctx, 106 * P, 232 * P, 9 * P, "#ffffff");
  // Avion, données, wifi, bluetooth.
  rond(235, 120, "✈️");
  rond(320, 120, "📶", true, "#34c759");
  rond(235, 205, "🛜", true, "#0a84ff");
  rond(320, 205, "🔵", true, "#0a84ff");
  // Concentration, luminosité, volume.
  verre(ctx, 24 * P, 270 * P, 164 * P, 70 * P, 35 * P, 0.9);
  texte(ctx, `🌙 ${t.focus[2][0]}`, 106 * P, 312 * P, 14 * P, "#1c1c1e", "center", POLICE.titre);
  for (const [x, e, n] of [[205, "🔆", 0.65], [290, "🔊", 0.45]] as const) {
    verre(ctx, x * P, 270 * P, 74 * P, 164 * P, 30 * P, 0.18);
    ctx.save();
    rectArrondi(ctx, x * P, 270 * P, 74 * P, 164 * P, 30 * P);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x * P, (270 + 164 * (1 - n)) * P, 74 * P, 164 * n * P);
    ctx.restore();
    texte(ctx, e, (x + 37) * P, 418 * P, 20 * P, "#000", "center");
  }
  // Les raccourcis.
  rond(60, 400, "🔦");
  rond(145, 400, "⏱️");
  rond(60, 485, "🧮");
  rond(145, 485, "📷");
  rond(235, 485, "🔒");
  rond(320, 485, "🎙️");
  return cv;
}

export function concentration(fondImg: Image, t: TextesIos) {
  const cv = createCanvas(LARGEUR, HAUTEUR);
  const ctx = cv.getContext("2d");
  fondEcran(ctx, fondImg, 34, 0.5);
  texte(ctx, t.focus_titre, LARGEUR / 2, 236 * P, 17 * P, "#ffffff", "center", POLICE.titre);
  t.focus.forEach(([nom, sous], i) => {
    const y = (262 + i * 74) * P;
    verre(ctx, 34 * P, y, 325 * P, 60 * P, 30 * P, i === 2 ? 0.92 : 0.2);
    const c = i === 2 ? "#1c1c1e" : "#ffffff";
    texte(ctx, ["🌙", "🛏️", "📚", "🤍"][i], 60 * P, y + 38 * P, 18 * P, c, "center");
    texte(ctx, nom, LARGEUR / 2, y + (sous ? 28 : 36) * P, 15 * P, c, "center", POLICE.titre);
    if (sous) texte(ctx, sous, LARGEUR / 2, y + 46 * P, 11 * P, i === 2 ? "#5b5b60" : "rgba(255,255,255,0.7)", "center");
    texte(ctx, "···", 334 * P, y + 36 * P, 15 * P, c, "center", POLICE.titre);
  });
  ctx.beginPath();
  ctx.arc(LARGEUR / 2, 600 * P, 18 * P, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fill();
  texte(ctx, "+", LARGEUR / 2, 607 * P, 22 * P, "#ffffff", "center");
  texte(ctx, t.focus_nouveau, LARGEUR / 2, 640 * P, 12 * P, "#ffffff", "center");
  return cv;
}
