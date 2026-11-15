// Planches : images téléchargées (cache donnees/cache/), vignettes, texte posé
// façon TikTok (texte natif centré, ombre). Sert à
// REGARDER : banque d'images, aperçu d'un original avant dépôt, slides des
// posts relevés par la veille.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

const ICI = dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(join(ICI, "..", "..", "page-blanche", "polices", "Inter-Medium.ttf"), "Inter Medium");

const CACHE = "donnees/cache";

/** Octets d'une image (cache local par id), une nouvelle tentative si le CDN coupe. */
export async function image(id: string, url: string): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const chemin = join(CACHE, `${id.replace(/[^\w.-]/g, "_")}.jpg`);
  if (existsSync(chemin)) return readFileSync(chemin);
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${id} : HTTP ${r.status}`);
      const octets = Buffer.from(await r.arrayBuffer());
      writeFileSync(chemin, octets);
      return octets;
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere;
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

export type Case = { id: string; url: string; texte?: string; legende?: string; couleur?: string };

/** Une case 9:16 : image recadrée (cover) ou entière (contain), texte centré, légende en bas. */
async function caseImage(ctx: SKRSContext2D, x: number, y: number, l: number, h: number, octets: Buffer, k: Case, mode: "cover" | "contain") {
  const im = await loadImage(octets);
  const e = mode === "cover" ? Math.max(l / im.width, h / im.height) : Math.min(l / im.width, h / im.height);
  const lw = im.width * e;
  const lh = im.height * e;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, l, h);
  ctx.clip();
  ctx.drawImage(im, x + (l - lw) / 2, y + (h - lh) / 2, lw, lh);
  if (k.texte) {
    const taille = Math.round(l / 19);
    ctx.font = `${taille}px "Inter Medium"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ls = lignes(ctx, k.texte, l * 0.84);
    const pas = taille * 1.3;
    let ly = y + h / 2 - ((ls.length - 1) * pas) / 2;
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = taille / 2;
    ctx.fillStyle = k.couleur ?? "#fff";
    for (const s of ls) {
      ctx.fillText(s, x + l / 2, ly);
      ly += pas;
    }
  }
  ctx.restore();
  if (k.legende) {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(x, y + h - 22, l, 22);
    ctx.fillStyle = "#ffd84d";
    ctx.font = `14px "Inter Medium"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(k.legende, x + 6, y + h - 11);
  }
}

/** Planche JPEG : `colonnes` cases 9:16 de `largeur` px. */
export async function planche(cases: Case[], sortie: string, colonnes = 6, largeur = 270, mode: "cover" | "contain" = "cover"): Promise<void> {
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
      await caseImage(ctx, x, y, largeur, h, await image(k.id, k.url), k, mode);
    } catch (e) {
      ctx.fillStyle = "#f55";
      ctx.fillText(String(e).slice(0, 40), x + 8, y + 20);
    }
  }
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, await c.encode("jpeg", 82));
}
