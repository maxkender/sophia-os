// Usage :
//   npm run photos -- "man running" [--limite 48] [--toute-banque]
//   puis : npm run detourer -- <id ou 8 premiers caractères> <nom>
//
// L'homme qui court de la slide Atala vient de la banque de l'OS (demande
// d'Adrien du 19/11 : « image d'homme qui court dans la bibliothèque, label
// male_run »), par l'action `photos` de la fonction `pods` : la banque du
// label male_run (`--toute-banque` : toute la banque de l'OS), dont la
// description (en anglais) contient chaque mot cherché EN DÉBUT DE MOT (« man »
// ne trouve pas « woman »), sans texte, les moins utilisées d'abord, les
// personnes entières permises (`personnes: true`), jamais un portrait ni un
// selfie.
// - la recherche écrit donnees/photos.json et la planche sortie/photos/<mots>.jpg
//   (chaque vignette porte les 8 premiers caractères de son id) : REGARDE-la
//   avec Read ;
// - `npm run detourer -- <id> <nom>` détoure la photo choisie (BiRefNet, noir
//   et blanc) dans images/detoures/<nom>.png et note son id dans
//   donnees/banque.json : recopie-le dans `banque` du post.
// Choisis un coureur EN ENTIER, de profil ou de trois quarts, en pleine
// foulée, le visage petit ou détourné : il se détoure proprement. La
// description peut se tromper, et les drapeaux de visage de la banque ne sont
// remplis que pour l'UGC : regarde le détourage en taille réelle. Jamais une
// célébrité, jamais une marque lisible (short, chaussures), jamais de texte.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod } from "./api.ts";
import { planche } from "./planche.ts";

type Photo = { id: string; url: string; caption: string; used_count: number | null };
const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);

const cherche = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--limite")).join(" ");
if (!cherche.trim()) throw new Error('usage : npm run photos -- "man running" [--limite 48] | --garder <id> <nom>');
const limite = Number(args.includes("--limite") ? args[args.indexOf("--limite") + 1] : 48);

// La banque du label male_run (demande d'Adrien du 19/11), sauf --toute-banque.
const label = args.includes("--toute-banque") ? undefined : "male-run";
const r = await appelPod<{ photos: Photo[] }>({ action: "photos", cherche, limite, personnes: true, ...(label ? { label } : {}) });
if (!r.ok) throw new Error(r.error);
mkdirSync(join(racine, "donnees"), { recursive: true });
writeFileSync(join(racine, "donnees", "photos.json"), JSON.stringify(r.photos, null, 1));
if (!r.photos.length) {
  console.log(`aucune photo pour « ${cherche} » : essaie d'autres mots anglais (man running, jogging, runner, sprint…)`);
  process.exit(0);
}
mkdirSync(join(racine, "sortie", "photos"), { recursive: true });
const nom = join("sortie", "photos", `${cherche.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`);
await planche(
  r.photos.map((p) => ({ id: p.id, url: p.url, legende: `${p.id.slice(0, 8)} · ${p.used_count ?? 0}×` })),
  join(racine, nom),
  8,
  200,
);
console.log(`${r.photos.length} photos pour « ${cherche} » → ${nom} (détail : donnees/photos.json)`);
for (const p of r.photos.slice(0, 12)) console.log(`  ${p.id.slice(0, 8)} ${p.caption.slice(0, 90)}`);
