// Usage : POD_JETON=… node atelier/cli-photos.ts "mots en anglais" [--limite 24] [--sans-personnes]
//
// Cherche dans TOUTE la banque photo de l'OS (action `photos`, description en
// anglais, chaque mot pris en début de mot) et télécharge les photos trouvées
// dans sources/os_<id8>.jpg (hors git, comme les autres sources). On les pose
// ensuite dans une mise en page avec l'action « remplacer »
// ({"remplacer":{"source":"sources/os_<id8>.jpg","boite":[x,y,l,h]}}).
// Les moins utilisées sortent d'abord. Écrit aussi donnees/photos-<mots>.json
// (id, fichier, légende, used_count) et une planche sortie/photos/<mots>.jpg
// où chaque vignette porte son id8.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { appelPod } from "./api.ts";

type Photo = { id: string; url: string; caption?: string | null; used_count?: number };
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const cherche = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--limite");
if (!cherche) throw new Error('usage : npm run photos -- "mots en anglais" [--limite 24]');
const limite = Number(opt("--limite") ?? 24);
const personnes = !args.includes("--sans-personnes");

const r = await appelPod<{ photos: Photo[] }>({ action: "photos", cherche, limite, personnes });
if (!r.ok) throw new Error(r.error);
const photos = [...(r.photos ?? [])].sort((a, b) => (a.used_count ?? 0) - (b.used_count ?? 0));

mkdirSync("sources", { recursive: true });
const liste: { id8: string; fichier: string; legende: string | null; used_count: number }[] = [];
for (const p of photos) {
  const id8 = p.id.slice(0, 8);
  const fichier = join("sources", `os_${id8}.jpg`);
  if (!existsSync(fichier)) {
    const rep = await fetch(p.url);
    if (!rep.ok) { console.warn(`${id8} : téléchargement ${rep.status}`); continue; }
    writeFileSync(fichier, Buffer.from(await rep.arrayBuffer()));
  }
  liste.push({ id8, fichier, legende: p.caption ?? null, used_count: p.used_count ?? 0 });
}

const slug = cherche.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
mkdirSync("donnees", { recursive: true });
writeFileSync(join("donnees", `photos-${slug}.json`), JSON.stringify(liste, null, 1));

// Planche : 6 colonnes, vignettes de 240 px de large, id8 en légende.
if (liste.length) {
  const L = 240, H = 300, cols = 6, rangs = Math.ceil(liste.length / cols);
  const toile = createCanvas(L * cols, H * rangs);
  const ctx = toile.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, toile.width, toile.height);
  for (const [i, p] of liste.entries()) {
    const img = await loadImage(p.fichier);
    const e = Math.min(L / img.width, (H - 24) / img.height);
    const x = (i % cols) * L, y = Math.floor(i / cols) * H;
    ctx.drawImage(img, x + (L - img.width * e) / 2, y, img.width * e, img.height * e);
    ctx.fillStyle = "#000";
    ctx.font = "16px sans-serif";
    ctx.fillText(`${p.id8} (${p.used_count})`, x + 6, y + H - 6);
  }
  mkdirSync(join("sortie", "photos"), { recursive: true });
  writeFileSync(join("sortie", "photos", `${slug}.jpg`), toile.toBuffer("image/jpeg"));
}
for (const p of liste) console.log(`${p.fichier}  utilisée ${p.used_count}×  ${p.legende ?? ""}`);
console.log(`${liste.length} photo(s) pour « ${cherche} » ; planche : sortie/photos/${slug}.jpg`);
