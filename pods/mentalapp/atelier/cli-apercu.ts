// Usage : npm run apercu -- <id> [--langues en,fr]
//
// Planche de relecture d'un post : la slide source en tête, puis la version
// rendue de chaque langue (sortie/<id>/<langue>/<n>.jpg), côte à côte. Écrit
// sortie/apercus/<id>.jpg, à regarder avec l'outil Read avant de livrer.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { LANGUES } from "./api.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run apercu -- <id> [--langues en,fr]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const langues = opt("--langues")?.split(",") ?? [...LANGUES];
const positions = readdirSync(`sources/${id}`)
  .map((f) => Number(f.replace(".jpg", "")))
  .filter(Number.isInteger)
  .sort((a, b) => a - b);

const W = 360;
const H = Math.round((W * 1350) / 1080);
const rangees = [{ nom: "source", dossier: `sources/${id}` }, ...langues.map((l) => ({ nom: l, dossier: `sortie/${id}/${l}` }))];
const c = createCanvas(40 + positions.length * (W + 10), rangees.length * (H + 10));
const ctx = c.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, c.width, c.height);
for (const [r, rangee] of rangees.entries()) {
  ctx.save();
  ctx.translate(26, r * (H + 10) + H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(rangee.nom, 0, 0);
  ctx.restore();
  for (const [k, n] of positions.entries()) {
    const chemin = `${rangee.dossier}/${n}.jpg`;
    if (!existsSync(chemin)) continue;
    const img = await loadImage(chemin);
    ctx.drawImage(img, 40 + k * (W + 10), r * (H + 10), W, Math.round((W * img.height) / img.width));
  }
}
mkdirSync("sortie/apercus", { recursive: true });
writeFileSync(`sortie/apercus/${id}.jpg`, await c.encode("jpeg", 85));
console.log(`sortie/apercus/${id}.jpg`);
