// Usage : node atelier/cli-geometrie.ts <dossier-slides> <dossier-sortie>
// Écrit pour chaque slide <nom>.geo.json et <nom>.annote.png (boîtes numérotées,
// vert = texte, rouge = image) — l'annotation sert à la transcription.

import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { analyserSlide } from "./geometrie.ts";

const [entree, sortie] = process.argv.slice(2);
mkdirSync(sortie, { recursive: true });

for (const f of readdirSync(entree).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort()) {
  const chemin = join(entree, f);
  const geo = await analyserSlide(chemin);
  const nom = basename(f).replace(/\.[^.]+$/, "");
  writeFileSync(join(sortie, `${nom}.geo.json`), JSON.stringify(geo, null, 1));

  const img = await loadImage(chemin);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.font = "bold 26px sans-serif";
  for (const e of geo.elements) {
    const b = e.boite;
    ctx.strokeStyle = e.type === "texte" ? "#00a651" : "#e00000";
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x - 3, b.y - 3, b.l + 6, b.h + 6);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(Math.max(0, b.x - 46), Math.max(0, b.y - 4), 42, 30);
    ctx.fillStyle = "#fff";
    ctx.fillText(e.id, Math.max(2, b.x - 44), Math.max(24, b.y + 20));
  }
  writeFileSync(join(sortie, `${nom}.annote.png`), await c.encode("png"));
  console.log(nom, geo.elements.map((e) => (e.type === "texte" ? `${e.id}(${e.lignes.length}l)` : e.id)).join(" "));
}
