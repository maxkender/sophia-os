// Planches : images téléchargées (cache donnees/cache/), vignettes, texte posé
// façon TikTok (texte natif blanc centré, ombre). Sert à REGARDER ce qu'on
// choisit : banque d'images, aperçu d'un original avant dépôt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

const ICI = dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(join(ICI, "..", "..", "page-blanche", "polices", "Inter-Medium.ttf"), "Inter Medium");

const CACHE = "donnees/cache";

/** Octets d'une image (cache local par id). */
export async function image(id: string, url: string): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const chemin = join(CACHE, `${id}.jpg`);
  if (existsSync(chemin)) return readFileSync(chemin);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${id} : HTTP ${r.status}`);
  const octets = Buffer.from(await r.arrayBuffer());
  writeFileSync(chemin, octets);
  return octets;
}

function lignes(ctx: SKRSContext2D, texte: string, largeur: number): string[] {
  const sortie: string[] = [];
  for (const para of texte.split("\n")) {
    if (!para.trim()) {
      sortie.push("");
      continue;
    }
    let ligne = "";
    for (const mot of para.split(/\s+/)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (ctx.measureText(essai).width > largeur && ligne) {
        sortie.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    sortie.push(ligne);
  }
  return sortie;
}

/** Une case : image ajustée (cover) en 9:16, texte optionnel centré, légende en bas. */
async function caseImage(ctx: SKRSContext2D, x: number, y: number, l: number, h: number, octets: Buffer, texte?: string, legende?: string) {
  const im = await loadImage(octets);
  const e = Math.max(l / im.width, h / im.height);
  const lw = im.width * e;
  const lh = im.height * e;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, l, h);
  ctx.clip();
  ctx.drawImage(im, x + (l - lw) / 2, y + (h - lh) / 2, lw, lh);
  if (texte) {
    const taille = Math.round(l / 19);
    ctx.font = `${taille}px "Inter Medium"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ls = lignes(ctx, texte, l * 0.84);
    const pas = taille * 1.3;
    let ly = y + h / 2 - ((ls.length - 1) * pas) / 2;
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = taille / 2;
    ctx.fillStyle = "#fff";
    for (const s of ls) {
      ctx.fillText(s, x + l / 2, ly);
      ly += pas;
    }
  }
  ctx.restore();
  if (legende) {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(x, y + h - 22, l, 22);
    ctx.fillStyle = "#ffd84d";
    ctx.font = `14px "Inter Medium"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(legende, x + 6, y + h - 11);
  }
}

export type Case = { id: string; url: string; texte?: string; legende?: string };

/** Planche JPEG : `colonnes` cases 9:16 de `largeur` px. */
export async function planche(cases: Case[], sortie: string, colonnes = 6, largeur = 270): Promise<void> {
  const h = Math.round((largeur * 16) / 9);
  const rangs = Math.ceil(cases.length / colonnes);
  const c = createCanvas(colonnes * largeur + (colonnes - 1) * 6, rangs * h + (rangs - 1) * 6);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, c.width, c.height);
  for (const [i, k] of cases.entries()) {
    const x = (i % colonnes) * (largeur + 6);
    const y = Math.floor(i / colonnes) * (h + 6);
    try {
      await caseImage(ctx, x, y, largeur, h, await image(k.id, k.url), k.texte, k.legende);
    } catch (e) {
      ctx.fillStyle = "#f55";
      ctx.fillText(String(e).slice(0, 40), x + 8, y + 20);
    }
  }
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, await c.encode("jpeg", 82));
}
