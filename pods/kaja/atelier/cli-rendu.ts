// Usage : npm run rendu -- <id> [--langues en,fr]   (ou npm run apercu)
//
// Rend chaque slide du remake posts/<id>.json dans chaque langue écrite :
// sortie/<id>/<langue>/<n>.jpg (1080 × 1920, JPEG sans métadonnées), puis la
// planche de relecture sortie/apercus/<id>.<langue>.jpg. Regarde toujours la
// planche ET les slides une à une avec l'outil Read avant de livrer.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { estSlideSophia, languesCompletes, lirePost, RACINE, rendreSlide } from "./slides.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run rendu -- <id> [--langues en,fr]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const post = lirePost(id);
const langues = opt("--langues")?.split(",") ?? languesCompletes(post);
if (!langues.length) throw new Error(`${id} : aucune langue complète (titre, légende et chaque slide)`);

for (const langue of langues) {
  const dossier = join(RACINE, "sortie", id, langue);
  mkdirSync(dossier, { recursive: true });
  const fichiers: string[] = [];
  for (const [i, s] of post.slides.entries()) {
    const f = join(dossier, `${i + 1}.jpg`);
    writeFileSync(f, await rendreSlide(post, s, langue));
    fichiers.push(f);
  }
  // La planche : toutes les slides, 4 par rangée, numérotées.
  const col = 4;
  const lv = 405;
  const hv = 720;
  const rangees = Math.ceil(fichiers.length / col);
  const planche = createCanvas(col * (lv + 8) + 8, rangees * (hv + 40) + 8);
  const ctx = planche.getContext("2d");
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, 0, planche.width, planche.height);
  for (const [i, f] of fichiers.entries()) {
    const x = 8 + (i % col) * (lv + 8);
    const y = 8 + Math.floor(i / col) * (hv + 40);
    ctx.drawImage(await loadImage(f), x, y, lv, hv);
    const s = post.slides[i];
    ctx.fillStyle = "#ffd76a";
    ctx.font = "22px sans-serif";
    ctx.fillText(`#${i + 1}${estSlideSophia(s) ? " · Sophia" : s.app ? ` · ${s.app}` : ""}`, x + 4, y + hv + 28);
  }
  mkdirSync(join(RACINE, "sortie", "apercus"), { recursive: true });
  const fp = join(RACINE, "sortie", "apercus", `${id}.${langue}.jpg`);
  writeFileSync(fp, planche.toBuffer("image/jpeg", 88));
  console.log(`${id} ${langue} : ${fichiers.length} slides → sortie/${id}/${langue}/ · planche ${fp.replace(`${RACINE}/`, "")}`);
}
