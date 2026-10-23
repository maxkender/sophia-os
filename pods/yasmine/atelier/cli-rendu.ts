// Usage : npm run rendu -- <id> [--langues fr,en]
//
// Rend chaque slide du remake posts/<id>.json dans chaque langue écrite :
// sortie/<id>/<langue>/<n>.jpg (1080 × 1920, JPEG sans métadonnées), puis la
// planche de relecture sortie/apercus/<id>.<langue>.jpg. Regarde toujours la
// planche ET les slides une à une avec l'outil Read avant de livrer.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerFond, languesCompletes, lirePost, RACINE, rendreSlide } from "./slides.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run rendu -- <id> [--langues fr,en]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const post = lirePost(id);
const langues = opt("--langues")?.split(",") ?? languesCompletes(post);
if (!langues.length) throw new Error(`${id} : aucune langue complète (titre, légende et chaque slide)`);
const photo = await chargerFond(post);

for (const langue of langues) {
  const dossier = join(RACINE, "sortie", id, langue);
  mkdirSync(dossier, { recursive: true });
  const fichiers: string[] = [];
  for (const [i, s] of post.slides.entries()) {
    const jpeg = await rendreSlide(post, s, langue, photo);
    const f = join(dossier, `${i + 1}.jpg`);
    writeFileSync(f, jpeg);
    fichiers.push(f);
  }
  // La planche : toutes les slides, 5 par rangée, numérotées.
  const col = 5;
  const lv = 324;
  const hv = 576;
  const rangees = Math.ceil(fichiers.length / col);
  const planche = createCanvas(col * (lv + 8) + 8, rangees * (hv + 40) + 8);
  const ctx = planche.getContext("2d");
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, 0, planche.width, planche.height);
  for (const [i, f] of fichiers.entries()) {
    const x = 8 + (i % col) * (lv + 8);
    const y = 8 + Math.floor(i / col) * (hv + 40);
    ctx.drawImage(await loadImage(f), x, y, lv, hv);
    ctx.fillStyle = "#ffd76a";
    ctx.font = "22px sans-serif";
    ctx.fillText(`#${i + 1}${post.slides[i].app ? " · app" : ""}`, x + 4, y + hv + 28);
  }
  mkdirSync(join(RACINE, "sortie", "apercus"), { recursive: true });
  const fp = join(RACINE, "sortie", "apercus", `${id}.${langue}.jpg`);
  writeFileSync(fp, planche.toBuffer("image/jpeg", 88));
  console.log(`${id} ${langue} : ${fichiers.length} slides → sortie/${id}/${langue}/ · planche ${fp.replace(`${RACINE}/`, "")}`);
}
