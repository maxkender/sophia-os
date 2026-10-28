// Original au format « carrousel » (le format de @mentalapp depuis le 18/10) :
// une couverture « <Thème> tier list » avec une image détourée et la frise
// S+ → F, puis un item par slide : badge du rang, titre, photo arrondie,
// deux phrases d'explication. L'élément UnSwipe est un item à lui seul (cta C) :
// l'icône, « delete short-videos (UnSwipe app) » et un conseil à la 1re personne.

import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
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
type Recadrage = { src: string; boite: Boite };
export type Rang = "S+" | "A" | "B" | "C" | "D" | "F";
/** `rang` absent : pas de badge (liste de leçons plutôt que classement). */
type Item = { rang?: Rang; titre: ParLangue; texte: ParLangue } & ({ app: true } | Recadrage);

export type Carrousel = {
  id: string;
  format: "carrousel";
  titre: string;
  legendes: ParLangue;
  /** `frise: false` : pas de frise S+ → F sous l'image (accroche sans classement). */
  couverture: { image: Recadrage; theme: ParLangue; sous: ParLangue; frise?: boolean };
  items: Item[];
  notes?: string;
};

const L = 1080;
const H = 1350;
const FOND = "#edf2eb";
const ENCRE = "#141913";
export const COULEURS: Record<Rang, string> = { "S+": "#fb0200", A: "#ffb877", B: "#fadc7c", C: "#fffd68", D: "#bdfd85", F: "#8685ed" };

function police(ctx: SKRSContext2D, taille: number, graisse: number, approche = 0) {
  ctx.font = `${taille}px "${FAMILLES[graisse]}"`;
  ctx.letterSpacing = `${approche * taille}px`;
}
function largeur(ctx: SKRSContext2D, t: string) {
  const m = ctx.measureText(t);
  return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
}
function centree(ctx: SKRSContext2D, t: string, cx: number, base: number, taille: number, graisse: number, max: number, approche = 0) {
  let s = taille;
  police(ctx, s, graisse, approche);
  while (largeur(ctx, t) > max && s > 8) police(ctx, (s -= 0.5), graisse, approche);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.fillText(t, cx, base);
  return s;
}
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
function arrondi(ctx: SKRSContext2D, x: number, y: number, l: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}
/** Une case de rang (badge) : aplat de la couleur, cadre noir, lettre, « tier ». */
function badge(ctx: SKRSContext2D, rang: Rang, x: number, y: number, c: number, mot = "tier") {
  ctx.fillStyle = COULEURS[rang];
  ctx.fillRect(x, y, c, c);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = Math.max(1, c / 80);
  ctx.strokeRect(x, y, c, c);
  police(ctx, c * 0.33, 200);
  ctx.fillStyle = ENCRE;
  ctx.textAlign = "center";
  ctx.fillText(rang, x + c / 2, y + c * 0.56);
  if (mot) {
    police(ctx, c * 0.12, 300);
    ctx.fillText(mot, x + c / 2, y + c * 0.9);
  }
}

export async function rendreCarrousel(o: Carrousel, langue: Langue, icone: Image): Promise<Buffer[]> {
  const cache = new Map<string, Image>();
  const source = async (src: string) => {
    if (!cache.has(src)) cache.set(src, await loadImage(join(RACINE, `sources/${src}.jpg`)));
    return cache.get(src)!;
  };
  const slides: Buffer[] = [];

  // 1. Couverture.
  {
    const c = createCanvas(L, H);
    const x = c.getContext("2d");
    x.fillStyle = FOND;
    x.fillRect(0, 0, L, H);
    centree(x, o.couverture.theme[langue], L / 2, 275, 170, 200, 960, -0.03);
    centree(x, o.couverture.sous[langue], L / 2, 360, 84, 200, 900, -0.02);
    const [sx, sy, sl, sh] = o.couverture.image.boite;
    const k = Math.min(760 / sl, 720 / sh, 1.2);
    x.drawImage(await source(o.couverture.image.src), sx, sy, sl, sh, L / 2 - (sl * k) / 2, 1130 - sh * k, sl * k, sh * k);
    // La frise S+ → A → B → C → F, couronne sur le S+ (dessinée).
    const rangs: Rang[] = o.couverture.frise === false ? [] : ["S+", "A", "B", "C", "F"];
    const tailles = [68, 60, 54, 50, 44];
    let bx = 0;
    const total = tailles.reduce((a, b) => a + b, 0) + 4 * 26;
    bx = L / 2 - total / 2;
    rangs.forEach((r, i) => {
      const t = tailles[i];
      badge(x, r, bx, 1275 - t, t, "");
      if (i < rangs.length - 1) {
        x.fillStyle = ENCRE;
        x.fillRect(bx + t + 7, 1275 - t / 2, 12, 1.5);
      }
      bx += t + 26;
    });
    slides.push(retirerMetadonnees(await c.encode("jpeg", 92)));
  }

  // 2. Un item par slide.
  for (const it of o.items) {
    const c = createCanvas(L, H);
    const x = c.getContext("2d");
    x.fillStyle = FOND;
    x.fillRect(0, 0, L, H);
    if (it.rang) badge(x, it.rang, 88, 80, 156);
    const app = "app" in it;
    const titre = app ? LEGENDE_APP[langue].texte : it.titre[langue];
    const s = centree(x, titre, L / 2, 382, 104, 200, 960, -0.025);
    let basImage = 870;
    if (app) {
      police(x, Math.min(52, s * 0.5), 300);
      x.textAlign = "center";
      x.fillText(LEGENDE_APP[langue].appli, L / 2, 450);
      const cote = 330;
      const ix = L / 2 - cote / 2;
      const iy = 500;
      x.save();
      arrondi(x, ix, iy, cote, cote, RAYON_ICONE * cote);
      x.clip();
      x.drawImage(icone, ix, iy, cote, cote);
      x.restore();
      basImage = iy + cote;
    } else {
      const [sx, sy, sl, sh] = it.boite;
      const k = Math.min(456 / sl, 456 / sh, 1.3);
      const [l, h] = [sl * k, sh * k];
      const [ix, iy] = [L / 2 - l / 2, 415 + (456 - h) / 2];
      x.save();
      arrondi(x, ix, iy, l, h, 30);
      x.clip();
      x.drawImage(await source(it.src), sx, sy, sl, sh, ix, iy, l, h);
      x.restore();
      basImage = iy + h;
    }
    // Deux phrases centrées, sous l'image.
    let t = 46;
    police(x, t, 300, -0.01);
    let lignes = couper(x, it.texte[langue], 860);
    while (lignes.length > 5 && t > 34) {
      police(x, (t -= 1), 300, -0.01);
      lignes = couper(x, it.texte[langue], 860);
    }
    const pas = 1.3 * t;
    const debut = Math.max(basImage + 120, 1000 - ((lignes.length - 1) * pas) / 2);
    x.fillStyle = ENCRE;
    x.textAlign = "center";
    lignes.forEach((ligne, i) => x.fillText(ligne, L / 2, debut + i * pas));
    slides.push(retirerMetadonnees(await c.encode("jpeg", 92)));
  }
  return slides;
}

/** Les textes anglais d'un carrousel, dans l'ordre de lecture (note de pertinence). */
export function textesCarrousel(o: Carrousel): string[] {
  return [
    o.titre,
    ...o.items.flatMap((it) => ["app" in it ? `${LEGENDE_APP.en.texte} ${LEGENDE_APP.en.appli}` : it.titre.en, it.texte.en]),
  ];
}
