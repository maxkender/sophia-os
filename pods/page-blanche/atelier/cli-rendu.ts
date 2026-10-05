// Usage : node atelier/cli-rendu.ts <slides-source> <transcription.json> <sortie>
// transcription.json : { "post_id": "...", "slides": { "1": Transcription, ... } }
// Rend chaque slide du post (géométrie recalculée depuis la source) en JPEG
// sans métadonnées, et écrit un rapport des avertissements.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { analyserSlide } from "./geometrie.ts";
import { rendreSlide, type Transcription } from "./rendu.ts";
import { retirerMetadonnees, metadonneesRestantes } from "./metadonnees.ts";

const [dossierSource, fichierTr, sortie] = process.argv.slice(2);
const tr = JSON.parse(readFileSync(fichierTr, "utf8")) as { post_id: string; slides: Record<string, Transcription> };
mkdirSync(sortie, { recursive: true });

const rapport: Record<string, string[]> = {};
for (const [num, t] of Object.entries(tr.slides).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const source = join(dossierSource, `${tr.post_id}_${num}.jpg`);
  if (!existsSync(source)) {
    rapport[num] = ["source introuvable"];
    continue;
  }
  const geo = await analyserSlide(source);
  const { jpeg, rapport: r } = await rendreSlide(source, geo, t);
  const propre = retirerMetadonnees(jpeg);
  const restes = metadonneesRestantes(propre);
  if (restes.length) throw new Error(`${num} : métadonnées restantes ${restes.join(", ")}`);
  writeFileSync(join(sortie, `${tr.post_id}_${num}.jpg`), propre);
  rapport[num] = r.avertissements;
}
writeFileSync(join(sortie, `${tr.post_id}.rapport.json`), JSON.stringify(rapport, null, 1));
console.log(tr.post_id, JSON.stringify(rapport));
