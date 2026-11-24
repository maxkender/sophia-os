// Usage :
//   npm run image -- <nom> "<la scène, en anglais>" [--n 2]     une photo sombre (carrée)
//   npm run image -- <nom> "<la vue, en anglais>" --scan        une image de cerveau (IRM en couleurs)
//
// Une image neuve avec Seedream v4 sur fal (0,03 $ l'image). La clé vient de
// l'environnement (FAL_API) et ne s'affiche jamais. Réencodée sans
// métadonnées, dans images/photos/<nom>[-<n>].jpg, 1280 px au plus, carrée :
// - une photo (par défaut) : sombre, cinématographique, souvent en noir et
//   blanc, comme les siennes (une silhouette à la fenêtre la nuit, un
//   téléphone qui éclaire un lit, un escalier) ; les gens de dos, en
//   silhouette ou de loin, jamais un visage reconnaissable ;
// - un cerveau (--scan) : une IRM en fausses couleurs (bleu, vert, jaune,
//   rouge) ou un cerveau lumineux sur fond noir, comme ses couvertures.
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte, mains
// ou visages déformés, filigrane) part à la poubelle. Jamais une célébrité,
// jamais une marque, jamais de texte, jamais un écran lisible.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<en anglais>" [--n 2] [--scan]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const scan = args.includes("--scan");
const prompt = scan
  ? `${scene}. Scientific brain imaging on a pure black background, false-color neon heat map (blue, green, yellow, red), high contrast, centered. No text, no letters, no labels, no scale bar, no watermark.`
  : `${scene}. Dark moody cinematic photo, low light, deep blacks, subtle film grain, like an aesthetic discipline mood board. Faces never visible or recognizable (from behind, in silhouette or far away). No text, no letters, no readable screen, no brand logo, no watermark.`;
const taille = { width: 1280, height: 1280 };

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
mkdirSync(join(racine, "images", "photos"), { recursive: true });
for (const [i, im] of res.images.entries()) {
  const img = await loadImage(Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const f = join("images", "photos", `${nom}${n > 1 ? `-${i + 1}` : ""}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  console.log(f);
}
