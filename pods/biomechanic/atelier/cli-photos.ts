// Usage :
//   npm run photos -- "man running" [--label male-run] [--limite 48]
//   npm run photos -- "coffee" --toute-banque
//   npm run photos -- --garder <id ou 8 premiers caractères> <nom>
//
// Toutes les photos du podz viennent de la banque de l'OS (demande d'Adrien du
// 20/11 : « trouve images running dans la bibliothèque »), par l'action
// `photos` de la fonction `pods` : la description (en anglais) contient
// chaque mot cherché EN DÉBUT DE MOT (« man » ne trouve pas « woman »), sans
// texte, les moins utilisées d'abord, les personnes entières permises
// (`personnes: true`), jamais un portrait ni un selfie.
// - Par défaut, les banques de course de l'OS, l'une après l'autre : male_run,
//   clean_girl_run, classic_girl_run (`--label <slug>` : une seule) ;
//   `--toute-banque` : toute la banque (le café, la douche, le lit…).
// - La recherche écrit donnees/photos.json et la planche sortie/photos/<mots>.jpg
//   (chaque vignette porte les 8 premiers caractères de son id) : REGARDE-la
//   avec Read.
// - `--garder` télécharge la photo choisie (dans la dernière recherche) en
//   images/banque/<nom>.jpg (prise dans n'importe quelle recherche du jour,
//   donnees/photos-<mots>.json), réencodée sans métadonnées, et note son id dans
//   donnees/banque.json : recopie-le dans `banque` du post.
// La description peut se tromper, et les drapeaux de visage de la banque ne
// sont remplis que pour l'UGC : regarde chaque photo gardée en taille réelle.
// Jamais une célébrité ni une scène de film ou de série, jamais une marque
// lisible (chaussures, short, logo d'appli), jamais de texte.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod } from "./api.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import { planche } from "./planche.ts";

type Photo = { id: string; url: string; caption: string; used_count: number | null };
const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);

if (args[0] === "--garder") {
  const [, cle, nom] = args;
  if (!cle || !nom || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : photos --garder <id> <nom-en-minuscules>");
  // Toutes les recherches du jour (donnees/photos-<mots>.json), pas seulement la dernière.
  const photos = readdirSync(join(racine, "donnees"))
    .filter((f) => /^photos(-.+)?\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(join(racine, "donnees", f), "utf8")) as Photo[]);
  const p = photos.find((x) => x.id === cle || x.id.startsWith(cle));
  if (!p) throw new Error(`${cle} : dans aucune recherche (donnees/photos*.json)`);
  const r = await fetch(p.url);
  if (!r.ok) throw new Error(`${p.id} : HTTP ${r.status}`);
  const img = await loadImage(Buffer.from(await r.arrayBuffer()));
  // 1400 px au plus de côté : la slide l'affiche à ~500 px, et le dépôt reste léger.
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  mkdirSync(join(racine, "images", "banque"), { recursive: true });
  const f = join("images", "banque", `${nom}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 92)));
  const fichier = join(racine, "donnees", "banque.json");
  const banque = existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf8")) as Record<string, string>) : {};
  banque[f] = p.id;
  writeFileSync(fichier, JSON.stringify(banque, null, 1));
  console.log(`${f} ← ${p.id} (${c.width} × ${c.height}) : ${p.caption.slice(0, 100)}`);
  process.exit(0);
}

const cherche = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))).join(" ");
if (!cherche.trim()) throw new Error('usage : npm run photos -- "man running" [--label male-run | --toute-banque] [--limite 48] | --garder <id> <nom>');
const limite = Number(args.includes("--limite") ? args[args.indexOf("--limite") + 1] : 48);

const LABELS_COURSE = ["male-run", "clean-girl-run", "classic-girl-run"];
const labels = args.includes("--toute-banque")
  ? [undefined]
  : args.includes("--label")
    ? [args[args.indexOf("--label") + 1]]
    : LABELS_COURSE;
const vues = new Set<string>();
const photos: Photo[] = [];
for (const label of labels) {
  const r = await appelPod<{ photos: Photo[] }>({ action: "photos", cherche, limite, personnes: true, ...(label ? { label } : {}) });
  if (!r.ok) throw new Error(r.error);
  for (const p of r.photos) if (!vues.has(p.id) && photos.length < limite) (vues.add(p.id), photos.push(p));
}
const r = { photos };
mkdirSync(join(racine, "donnees"), { recursive: true });
writeFileSync(join(racine, "donnees", "photos.json"), JSON.stringify(r.photos, null, 1));
writeFileSync(join(racine, "donnees", `photos-${cherche.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`), JSON.stringify(r.photos, null, 1));
if (!r.photos.length) {
  console.log(`aucune photo pour « ${cherche} » : essaie d'autres mots anglais (running, jogging, trail, coffee, walking, sunrise…) ou --toute-banque`);
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
