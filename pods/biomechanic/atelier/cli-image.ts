// Usage :
//   npm run image -- <nom> "<ce qu'on voit, en anglais>" [--n 2]            un dessin de couverture
//   npm run image -- <nom> "<ce qu'on voit, en anglais>" --icone [--n 2]    une petite image détourée, en couleurs
//
// Une image neuve avec Seedream v4 sur fal (0,03 $ l'image, un peu plus avec
// le détourage). La clé vient de l'environnement (FAL_API) et ne s'affiche
// jamais. Réencodée sans métadonnées, dans images/dessins/ :
// - un dessin (par défaut) : le croquis à l'encre noire de ses couvertures
//   (des bonhommes au lit, au réveil, au travail, une personne qui court),
//   sur un blanc pur (le fond clair est poussé au blanc ici) : <nom>.jpg ;
// - une icône (--icone) : la petite tête au cerveau lumineux en haut de ses
//   couvertures, ou un objet ; détourée par BiRefNet, en couleurs : <nom>.png.
// Les PHOTOS des slides viennent de la banque de l'OS (`npm run photos`), pas d'ici.
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte,
// mains ou visage déformés, filigrane) part à la poubelle. Jamais une
// célébrité, jamais un logo de marque, jamais ses images à lui (sa tête au
// cerveau vient d'une banque payante : on fait la nôtre).
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detourer } from "./detourage.ts";
import { retirerMetadonnees } from "./metadonnees.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<scène en anglais>" [--n 2] [--icone]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const icone = args.includes("--icone");
const prompt = icone
  ? `${scene}, a single isolated subject centered with generous margins, clean digital illustration, soft lighting, pure plain white background, no shadow on the background, no text, no letters, no logo, no watermark`
  : `${scene}. A simple hand-drawn doodle in thin black ink lines on a pure white background, minimal stick-figure style like a quick sketch in a notebook, no shading, no color. No text, no letters, no words, no logo, no watermark.`;
const taille = { width: 1440, height: 1440 };

const cle = process.env.FAL_API;
if (!cle) throw new Error("FAL_API manquant dans l'environnement");
const h = { Authorization: `Key ${cle}`, "content-type": "application/json" };
const r = await fetch("https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image", {
  method: "POST",
  headers: h,
  body: JSON.stringify({ prompt, image_size: taille, num_images: n }),
});
if (!r.ok) throw new Error(`fal : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
const q = (await r.json()) as { status_url: string; response_url: string };
for (let i = 0; i < 90; i++) {
  await new Promise((s) => setTimeout(s, 4000));
  const st = (await (await fetch(q.status_url, { headers: h })).json()) as { status: string };
  if (st.status === "COMPLETED") break;
}
const res = (await (await fetch(q.response_url, { headers: h })).json()) as { images?: { url: string }[] };
if (!res.images?.length) throw new Error(`fal : pas d'image (${JSON.stringify(res).slice(0, 200)})`);

const racine = join(import.meta.dirname, "..");
mkdirSync(join(racine, "images", "dessins"), { recursive: true });
for (const [i, im] of res.images.entries()) {
  const base = `${nom}${n > 1 ? `-${i + 1}` : ""}`;
  if (icone) {
    const f = join("images", "dessins", `${base}.png`);
    writeFileSync(join(racine, f), await detourer(im.url, { nb: false, max: 800 }));
    console.log(f);
    continue;
  }
  // Le dessin : le fond presque blanc devient blanc pur (la slide est blanche).
  const img = await loadImage(Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  const c = createCanvas(1000, Math.round((1000 * img.height) / img.width));
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  for (let k = 0; k < px.data.length; k += 4) {
    const g = (px.data[k] + px.data[k + 1] + px.data[k + 2]) / 3;
    const v = g > 225 ? 255 : g;
    px.data[k] = px.data[k + 1] = px.data[k + 2] = v;
  }
  ctx.putImageData(px, 0, 0);
  const f = join("images", "dessins", `${base}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 92)));
  console.log(f);
}
