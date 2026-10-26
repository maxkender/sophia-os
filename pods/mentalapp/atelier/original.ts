// Original à 100 % (décision du 17/10), format tier list (le carrousel est dans
// carrousel.ts) : une tier list neuve composée dans le
// style du compte (fond gris-vert, Inter Tight très fine, tableau S+ à F),
// avec des images recadrées dans les slides @mentalapp déjà relevées
// (sources/<id>/<n>.jpg). Couverture + tableau, une version par langue ;
// l'élément UnSwipe occupe une case du tableau.

import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Langue } from "./api.ts";
import { LEGENDE_APP, RAYON_ICONE } from "./app.ts";
import type { Boite } from "./geometrie.ts";
import { retirerMetadonnees } from "./metadonnees.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAMILLES: Record<number, string> = { 200: "IT ExtraLight", 300: "IT Light" };
GlobalFonts.registerFromPath(join(RACINE, "polices/InterTight-ExtraLight.ttf"), FAMILLES[200]);
GlobalFonts.registerFromPath(join(RACINE, "polices/InterTight-Light.ttf"), FAMILLES[300]);

type ParLangue = Record<Langue, string>;
/** Une image recadrée : slide source (« <id>/<n> ») et boîte dans cette slide. */
type Recadrage = { src: string; boite: Boite };
type Case = { app: true } | (Recadrage & { t: ParLangue });
type Rang = { lettre: string; fond: string; texte: string; sous: ParLangue; cases: Case[] };

export type Original = {
  /** `mm-o` + numéro, jamais réutilisé une fois validé ou rejeté. */
  id: string;
  /** L'accroche anglaise (note de pertinence). */
  titre: string;
  /** Slide de l'élément UnSwipe (jamais la couverture). */
  position_app: 2;
  legendes: ParLangue;
  couverture: { image: Recadrage; haut: ParLangue; gros: ParLangue; bas: ParLangue };
  titre_tableau: ParLangue;
  pied: ParLangue;
  /** Rangs du tableau principal (S+ à D), puis le rang F à part, sous un « + ». */
  rangs: Rang[];
  f: Rang;
  notes?: string;
};

export const cheminOriginal = (id: string) => join(RACINE, `originaux/${id}.json`);
export const estOriginal = (id: string) => /^mm-o\d+$/.test(id);

export function lireOriginal(id: string): Original {
  const chemin = cheminOriginal(id);
  if (!existsSync(chemin)) throw new Error(`${chemin} absent`);
  return JSON.parse(readFileSync(chemin, "utf8")) as Original;
}

/** Les textes anglais du tableau, dans l'ordre de lecture (note de pertinence). */
export function textesOriginal(o: Original): string[] {
  const cases = [...o.rangs, o.f].flatMap((r) => [r.sous.en, ...r.cases.map((c) => ("app" in c ? `${LEGENDE_APP.en.texte} ${LEGENDE_APP.en.appli}` : c.t.en.replace(/\|/g, " ")))]);
  return [o.titre, o.titre_tableau.en, ...cases, o.pied.en];
}

const L = 1080;
const H = 1350;
const FOND = "#edf2eb";
const ENCRE = "#141913";
/** Tableau : bords, colonne des rangs, hauteur d'un rang (repris du compte). */
const X0 = 82;
const X1 = 922;
const XR = 239;
const HR = 151;
const Y0 = 236;
const YF = 1066;
const COL = (X1 - XR) / 4;

function police(ctx: SKRSContext2D, taille: number, graisse: number, approche = 0) {
  ctx.font = `${taille}px "${FAMILLES[graisse]}"`;
  ctx.letterSpacing = `${approche * taille}px`;
}
function largeur(ctx: SKRSContext2D, t: string) {
  const m = ctx.measureText(t);
  return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
}
/** Une ligne centrée sur `cx`, réduite pour tenir dans `max`. */
function centree(ctx: SKRSContext2D, t: string, cx: number, base: number, taille: number, graisse: number, max: number, couleur = ENCRE, approche = 0) {
  let s = taille;
  police(ctx, s, graisse, approche);
  while (largeur(ctx, t) > max && s > 8) police(ctx, (s -= 0.5), graisse, approche);
  ctx.fillStyle = couleur;
  ctx.textAlign = "center";
  ctx.fillText(t, cx, base);
}
/** Coupe un texte mot à mot pour tenir dans `max`. */
function couper(ctx: SKRSContext2D, t: string, max: number): string[] {
  const lignes: string[] = [];
  let courante = "";
  for (const mot of t.split(" ")) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (!courante || largeur(ctx, essai) <= max) courante = essai;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  return [...lignes, courante];
}
/** Des lignes centrées, la dernière posée sur `bas` ; renvoie le haut du bloc. */
function legende(ctx: SKRSContext2D, lignes: string[], cx: number, bas: number, taille: number, max: number): number {
  let s = taille;
  police(ctx, s, 300);
  while (Math.max(...lignes.map((l) => largeur(ctx, l))) > max && s > 8) police(ctx, (s -= 0.5), 300);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  lignes.forEach((l, i) => ctx.fillText(l, cx, bas - (lignes.length - 1 - i) * 0.88 * s));
  return bas - (lignes.length - 1) * 0.88 * s - 0.75 * s;
}

export async function rendreOriginal(o: Original, langue: Langue, icone: Image): Promise<Buffer[]> {
  const cache = new Map<string, Image>();
  const source = async (src: string) => {
    if (!cache.has(src)) cache.set(src, await loadImage(join(RACINE, `sources/${src}.jpg`)));
    return cache.get(src)!;
  };
  /** Pose une image recadrée centrée sur `cx`, posée sur `bas`, dans maxL × maxH. */
  const poser = async (ctx: SKRSContext2D, r: Recadrage, cx: number, bas: number, maxL: number, maxH: number) => {
    const [sx, sy, sl, sh] = r.boite;
    const k = Math.min(maxL / sl, maxH / sh, 1.15);
    ctx.drawImage(await source(r.src), sx, sy, sl, sh, cx - (sl * k) / 2, bas - sh * k, sl * k, sh * k);
  };

  // 1. Couverture : « tier list of » / image / le mot fort en très gros / la suite.
  const c1 = createCanvas(L, H);
  const x1 = c1.getContext("2d");
  x1.fillStyle = FOND;
  x1.fillRect(0, 0, L, H);
  centree(x1, o.couverture.haut[langue], L / 2, 250, 175, 200, 900, ENCRE, -0.03);
  await poser(x1, o.couverture.image, L / 2, 790, 520, 470);
  centree(x1, o.couverture.gros[langue], L / 2, 1010, 190, 200, 960, ENCRE, -0.03);
  centree(x1, o.couverture.bas[langue], L / 2, 1160, 130, 200, 960, ENCRE, -0.03);

  // 2. Tableau.
  const c2 = createCanvas(L, H);
  const x = c2.getContext("2d");
  x.fillStyle = FOND;
  x.fillRect(0, 0, L, H);
  police(x, 64, 200, -0.02);
  x.fillStyle = ENCRE;
  x.textAlign = "left";
  x.fillText(o.titre_tableau[langue], 115, 160);
  const rang = async (r: Rang, y: number) => {
    x.fillStyle = r.fond;
    x.fillRect(X0, y, XR - X0, HR);
    centree(x, r.lettre, (X0 + XR) / 2, y + 100, 72, 200, 140);
    centree(x, r.sous[langue], (X0 + XR) / 2, y + HR - 14, 18, 300, XR - X0 - 10, r.texte);
    for (const [k, c] of r.cases.entries()) {
      const cx = XR + COL * (k + 0.5);
      const bas = y + HR - 10;
      const max = COL - 10;
      if ("app" in c) {
        police(x, 24, 300);
        const { texte, appli } = LEGENDE_APP[langue];
        const haut = legende(x, [...couper(x, texte, max), appli], cx, bas, 24, max);
        const cote = Math.min(95, haut - 6 - (y + 8));
        const [ix, iy, r2] = [cx - cote / 2, haut - 6 - cote, RAYON_ICONE * cote];
        x.save();
        x.beginPath();
        x.moveTo(ix + r2, iy);
        x.arcTo(ix + cote, iy, ix + cote, iy + cote, r2);
        x.arcTo(ix + cote, iy + cote, ix, iy + cote, r2);
        x.arcTo(ix, iy + cote, ix, iy, r2);
        x.arcTo(ix, iy, ix + cote, iy, r2);
        x.closePath();
        x.clip();
        x.drawImage(icone, ix, iy, cote, cote);
        x.restore();
      } else {
        police(x, 27, 300);
        let lignes = c.t[langue].split("|");
        if (lignes.length === 1 && largeur(x, lignes[0]) > max) lignes = couper(x, lignes[0], max);
        const haut = legende(x, lignes, cx, bas, 27, max);
        await poser(x, c, cx, haut - 4, max - 14, haut - 4 - (y + 8));
      }
    }
  };
  for (const [i, r] of o.rangs.entries()) await rang(r, Y0 + i * HR);
  await rang(o.f, YF);
  x.strokeStyle = "#000";
  x.lineWidth = 2;
  const cadre = (y: number, n: number) => {
    x.strokeRect(X0, y, X1 - X0, HR * n);
    x.beginPath();
    for (let i = 1; i < n; i++) {
      x.moveTo(X0, y + i * HR);
      x.lineTo(X1, y + i * HR);
    }
    x.moveTo(XR, y);
    x.lineTo(XR, y + HR * n);
    x.stroke();
  };
  cadre(Y0, o.rangs.length);
  cadre(YF, 1);
  police(x, 64, 200);
  x.textAlign = "center";
  x.fillStyle = ENCRE;
  x.fillText("+", (X0 + XR) / 2, 1048);
  police(x, 48, 200, -0.02);
  x.textAlign = "left";
  x.fillText(o.pied[langue], 120, 1305);

  return [retirerMetadonnees(await c1.encode("jpeg", 92)), retirerMetadonnees(await c2.encode("jpeg", 92))];
}
