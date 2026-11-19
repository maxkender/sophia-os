// Usage : npm run molecule -- <nom-anglais> [<fichier>]   (ex. : caffeine, l-theanine, "pramiracetam")
//
// La formule 2D d'une molécule, telle que la dessine PubChem (NCBI, domaine
// public), comme les petites figures de @bdnf.milly : noir sur blanc. Écrite
// dans images/molecule-<fichier>.jpg (sans métadonnées). Vérifie le nom sur
// PubChem si la molécule a plusieurs noms ; jamais une formule inventée.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const [nom, fichier] = process.argv.slice(2);
if (!nom) throw new Error("usage : npm run molecule -- <nom-anglais> [<fichier>]");
const sortie = (fichier ?? nom).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(nom)}/PNG?image_size=large`);
if (!r.ok) throw new Error(`PubChem : « ${nom} » introuvable (HTTP ${r.status})`);
const img = await loadImage(Buffer.from(await r.arrayBuffer()));
const c = createCanvas(img.width, img.height);
const ctx = c.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, c.width, c.height);
ctx.drawImage(img, 0, 0);
const racine = join(import.meta.dirname, "..");
mkdirSync(join(racine, "images"), { recursive: true });
const f = join("images", `molecule-${sortie}.jpg`);
writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 92)));
console.log(`${f} (${img.width} × ${img.height}) : regarde-la avec Read`);
