// Usage : npm run rendu -- <id> [--langues en,fr,de,es,it,tr]
//
// Rend les slides refaites d'un post, une version par langue, dans
// sortie/<id>/<langue>/<n>.jpg (JPEG sans métadonnées). Lit posts/<id>.json.

import { mkdirSync, writeFileSync } from "node:fs";
import { loadImage } from "@napi-rs/canvas";
import { LANGUES, type Langue } from "./api.ts";
import { CHEMIN_ICONE } from "./app.ts";
import { rendreSlide } from "./rendu.ts";
import { lireTranscription } from "./transcription.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run rendu -- <id> [--langues en,fr]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const langues = (opt("--langues")?.split(",") ?? [...LANGUES]) as Langue[];

const t = lireTranscription(id);
const icone = await loadImage(CHEMIN_ICONE);
const bilan: string[] = [];
for (const langue of langues) {
  const dossier = `sortie/${id}/${langue}`;
  mkdirSync(dossier, { recursive: true });
  for (const s of t.slides) {
    try {
      const r = await rendreSlide(`sources/${id}/${s.position}.jpg`, t, s.position, langue, icone);
      writeFileSync(`${dossier}/${s.position}.jpg`, r.jpeg);
      bilan.push(...r.avertissements.map((a) => `  ⚠ ${a}`));
    } catch (e) {
      bilan.push(`  ✗ ${langue} #${s.position} : ${(e as Error).message}`);
    }
  }
  bilan.push(`${langue} : ${dossier}`);
}
console.log(bilan.join("\n"));
