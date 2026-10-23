// Usage : npm run photos -- "desk laptop" [--limite 48]
//
// Cherche des photos dans TOUTE la banque de l'OS (action `photos` de la
// fonction `pods`) : leur description, en anglais, contient chaque mot
// cherché. Sans visage reconnaissable ni texte restant, les moins utilisées
// d'abord. Écrit donnees/photos.json et la planche sortie/photos/<mots>.jpg :
// chaque vignette porte les 8 premiers caractères de son id. Regarde-la avec
// l'outil Read, puis mets l'id complet et l'url dans le `fond` du post.

import { mkdirSync, writeFileSync } from "node:fs";
import { appelPod } from "./api.ts";
import { planche } from "./planche.ts";

const args = process.argv.slice(2);
const cherche = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))).join(" ");
if (!cherche.trim()) throw new Error('usage : npm run photos -- "desk laptop" [--limite 48]');
const limite = Number(args.includes("--limite") ? args[args.indexOf("--limite") + 1] : 48);

const r = await appelPod<{ photos: { id: string; url: string; caption: string; used_count: number | null }[] }>({ action: "photos", cherche, limite });
if (!r.ok) throw new Error(r.error);
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/photos.json", JSON.stringify(r.photos, null, 1));
if (!r.photos.length) {
  console.log(`aucune photo pour « ${cherche} » : essaie d'autres mots anglais (desk, notebook, library, coffee, bedroom…)`);
  process.exit(0);
}
mkdirSync("sortie/photos", { recursive: true });
const nom = `sortie/photos/${cherche.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
await planche(
  r.photos.map((p) => ({ id: p.id, url: p.url, legende: `${p.id.slice(0, 8)} · ${p.used_count ?? 0}×` })),
  nom,
  8,
  200,
);
console.log(`${r.photos.length} photos pour « ${cherche} » → ${nom} (détail : donnees/photos.json)`);
for (const p of r.photos.slice(0, 12)) console.log(`  ${p.id.slice(0, 8)} ${p.caption.slice(0, 90)}`);
