// Usage :
//   npm run compte -- <slide.jpg> <nom> --post <url> --slide <n> [--zone x0,y0,x1,y1] [--noircir x0,y0,x1,y1 …]
//
// Reprend une image de son compte (demande d'Adrien du 27/11 : « pas d'ia,
// reprends image du compte ») : sa slide de 1170 × 2080 (donnees/cache/
// tt_<post>_<n>.jpg, écrite par `npm run veille`), dont on découpe l'image
// noir et blanc posée sur le fond noir, sans aucun modèle d'IA :
// - par défaut, la plus grande tache non noire de la slide (son image ; ses
//   lettres font de petites taches à part), avec les morceaux qui la touchent ;
// - `--zone x0,y0,x1,y1` (repère 1170) quand l'image touche son texte (une
//   ligne collée au-dessus, une image à côté d'un paragraphe) : on découpe ce
//   rectangle, sans une lettre dedans ;
// - `--noircir x0,y0,x1,y1` (repère 1170, autant qu'il faut) passe au noir un
//   rectangle de la découpe : la fin d'une de ses lignes restée dans un coin ;
// - les pixels presque noirs passent au noir pur (ils se fondent dans notre
//   fond).
// Sort images/compte/<nom>.jpg (à sa taille chez lui), l'aperçu
// sortie/compte/<nom>.jpg (la slide avec la découpe en rouge, puis la
// découpe) À REGARDER avec Read, et note la provenance dans
// images/compte/index.json : recopie-la dans `compte` du post.
// Jamais une célébrité (il pose beaucoup d'acteurs : des scènes de films en
// noir et blanc), jamais son logo (l'œil d'« EYES WIDE SHUT »), sa signature
// ni une image avec du texte. Des statues, des masques, des silhouettes, des
// œuvres et des photos d'inconnus détournées, oui.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { RACINE } from "./slides.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const [source, nom] = args;
const post = opt("--post");
const slide = Number(opt("--slide"));
const zone = opt("--zone")?.split(",").map(Number);
const noircir = args.flatMap((a, i) => (a === "--noircir" ? [args[i + 1].split(",").map(Number)] : []));
if (noircir.some((r) => r.length !== 4 || r.some((v) => !Number.isFinite(v)))) throw new Error("--noircir x0,y0,x1,y1 (repère 1170)");
if (!source || !nom || !/^[a-z0-9-]{2,50}$/.test(nom) || !post || !slide) {
  throw new Error("usage : npm run compte -- <slide.jpg> <nom> --post <url> --slide <n> [--zone x0,y0,x1,y1]");
}
if (!/^https:\/\/www\.tiktok\.com\/@msclzz\/(photo|video)\/\d+$/.test(post)) throw new Error("--post : l'url de son post (https://www.tiktok.com/@msclzz/photo/<id>)");
if (zone && (zone.length !== 4 || zone.some((v) => !Number.isFinite(v)))) throw new Error("--zone x0,y0,x1,y1 (repère 1170)");

const img = await loadImage(readFileSync(source));
if (img.width !== 1170) throw new Error(`${source} : ${img.width} × ${img.height}, une de ses slides fait 1170 × 2080`);
const W = img.width;
const Hh = img.height;
const c = createCanvas(W, Hh);
const ctx = c.getContext("2d");
ctx.drawImage(img, 0, 0);
const d = ctx.getImageData(0, 0, W, Hh).data;
const allume = (x: number, y: number) => {
  const i = (y * W + x) * 4;
  return d[i] + d[i + 1] + d[i + 2] > 60;
};

let [x0, y0, x1, y1] = zone ?? [0, 0, 0, 0];
if (!zone) {
  // Les taches non noires (demi-résolution, 8-connexité) : la plus grande est son image ; ses
  // lettres font de petites taches à part (moins de 35 px de haut ici), qu'on n'avale que si elles
  // tombent DANS l'image (un reflet, un morceau détaché).
  const w = Math.floor(W / 2);
  const hh = Math.floor(Hh / 2);
  const on = new Uint8Array(w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) on[y * w + x] = allume(2 * x, 2 * y) || allume(2 * x + 1, 2 * y + 1) ? 1 : 0;
  const etiquette = new Int32Array(w * hh).fill(-1);
  const taches: { n: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  const pile: number[] = [];
  for (let i = 0; i < w * hh; i++) {
    if (!on[i] || etiquette[i] >= 0) continue;
    const t = { n: 0, x0: w, y0: hh, x1: 0, y1: 0 };
    const id = taches.length;
    etiquette[i] = id;
    pile.push(i);
    while (pile.length) {
      const j = pile.pop()!;
      const x = j % w, y = (j / w) | 0;
      t.n++;
      if (x < t.x0) t.x0 = x;
      if (x > t.x1) t.x1 = x;
      if (y < t.y0) t.y0 = y;
      if (y > t.y1) t.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= hh) continue;
          const k = Y * w + X;
          if (on[k] && etiquette[k] < 0) (etiquette[k] = id), pile.push(k);
        }
    }
    taches.push(t);
  }
  const graine = taches.filter((t) => t.y1 - t.y0 >= 35).sort((a, b) => b.n - a.n)[0];
  if (!graine || graine.n < 2000) throw new Error(`${source} : aucune image (une tache de 70 px de haut au moins) : donne --zone`);
  const boite = { ...graine };
  // Les morceaux de l'image : une tache haute près de la graine, ou une petite tache dedans.
  let change = true;
  while (change) {
    change = false;
    for (const t of taches) {
      if (t === graine || (t.x0 >= boite.x0 && t.x1 <= boite.x1 && t.y0 >= boite.y0 && t.y1 <= boite.y1)) continue;
      const pres = t.x1 >= boite.x0 - 15 && t.x0 <= boite.x1 + 15 && t.y1 >= boite.y0 - 15 && t.y0 <= boite.y1 + 15;
      const dedans = t.x0 >= boite.x0 && t.x1 <= boite.x1 && t.y0 >= boite.y0 && t.y1 <= boite.y1;
      if ((pres && t.y1 - t.y0 >= 35 && t.n > 300) || dedans) {
        boite.x0 = Math.min(boite.x0, t.x0); boite.y0 = Math.min(boite.y0, t.y0);
        boite.x1 = Math.max(boite.x1, t.x1); boite.y1 = Math.max(boite.y1, t.y1);
        change = true;
      }
    }
  }
  [x0, y0, x1, y1] = [boite.x0 * 2, boite.y0 * 2, boite.x1 * 2 + 2, boite.y1 * 2 + 2];
  // Une lettre restée dans la découpe (une tache de lettre qui chevauche la boîte) : l'aperçu le montre, donne --zone.
  const lettres = taches.filter((t) => t.y1 - t.y0 < 35 && t.n > 20 && t.x1 >= boite.x0 && t.x0 <= boite.x1 && t.y1 >= boite.y0 && t.y0 <= boite.y1 && !(t.x0 >= boite.x0 && t.x1 <= boite.x1 && t.y0 >= boite.y0 && t.y1 <= boite.y1));
  if (lettres.length) console.warn(`  ${lettres.length} petite(s) tache(s) à cheval sur la découpe (des lettres ?) : regarde l'aperçu, sinon --zone`);
}
const l = Math.round(x1 - x0);
const h = Math.round(y1 - y0);
if (l < 80 || h < 80) throw new Error(`découpe de ${l} × ${h} px : trop petite`);

const sortie = createCanvas(l, h);
const sctx = sortie.getContext("2d");
sctx.drawImage(img, x0, y0, l, h, 0, 0, l, h);
const sd = sctx.getImageData(0, 0, l, h);
for (let i = 0; i < sd.data.length; i += 4) if (sd.data[i] + sd.data[i + 1] + sd.data[i + 2] < 30) sd.data[i] = sd.data[i + 1] = sd.data[i + 2] = 0;
sctx.putImageData(sd, 0, 0);
sctx.fillStyle = "#000000";
for (const [a, b, c2, d2] of noircir) sctx.fillRect(a - x0, b - y0, c2 - a, d2 - b);
mkdirSync(join(RACINE, "images", "compte"), { recursive: true });
const f = join("images", "compte", `${nom}.jpg`);
writeFileSync(join(RACINE, f), retirerMetadonnees(sortie.toBuffer("image/jpeg", 94)));

// L'aperçu : la slide et la découpe en rouge, puis la découpe seule.
const k = 0.4;
const ap = createCanvas(Math.round(W * k) * 2 + 16, Math.round(Hh * k));
const actx = ap.getContext("2d");
actx.fillStyle = "#222";
actx.fillRect(0, 0, ap.width, ap.height);
actx.drawImage(img, 0, 0, W * k, Hh * k);
actx.strokeStyle = "#ff2020";
actx.lineWidth = 3;
actx.strokeRect(x0 * k, y0 * k, l * k, h * k);
const kk = Math.min((W * k) / l, (Hh * k) / h);
actx.drawImage(sortie, W * k + 16, 0, l * kk, h * kk);
mkdirSync(join(RACINE, "sortie", "compte"), { recursive: true });
writeFileSync(join(RACINE, "sortie", "compte", `${nom}.jpg`), ap.toBuffer("image/jpeg", 85));

const fichier = join(RACINE, "images", "compte", "index.json");
const index = existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf8")) as Record<string, unknown>) : {};
index[f] = { post, slide, zone: [x0, y0, x1, y1].map(Math.round), ...(noircir.length ? { noircir } : {}) };
writeFileSync(fichier, JSON.stringify(index, null, 1) + "\n");
console.log(`${f} ← ${post} slide ${slide} : ${l} × ${h} px (${[x0, y0, x1, y1].map(Math.round).join(",")}) · aperçu sortie/compte/${nom}.jpg`);
