// Usage :
//   npm run image -- <nom> "<ce qu'on voit, en anglais>" [--n 2] [--format bande|haut]
//
// Une photo neuve pour la couverture, avec Seedream v4 sur fal (0,03 $ l'image).
// La clé vient de l'environnement (FAL_API) et ne s'affiche jamais. Format
// `bande` par défaut (1170 × 693, une des trois bandes de sa couverture),
// `haut` pour une photo plus haute qu'on recadre à la main (`"y"` dans le post).
// Réencodée sans métadonnées (ni C2PA ni XMP) dans images/photos/<nom>[-<n>].jpg,
// 1170 px de large.
//
// Son style : des photos Pinterest prises au téléphone, lumière du jour, tons
// chauds et crème (des produits de beauté dans une trousse, une fille qui
// prend la pose, un bouquet de roses pâles). Le style est ajouté ici : décris
// seulement ce qu'on voit (« a cream quilted makeup bag full of skincare
// tubes on white sheets »).
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte,
// logo, visage ou mains déformés, filigrane) part à la poubelle. Jamais une
// célébrité, jamais un logo ni un nom de marque sur un produit.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<scène en anglais>" [--n 2] [--format bande|haut]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const format = opt("--format") ?? "bande";
const tailles: Record<string, { width: number; height: number }> = { bande: { width: 2048, height: 1214 }, haut: { width: 1536, height: 2048 } };
if (!tailles[format]) throw new Error("--format bande ou haut");
const prompt = `${scene}. Candid iPhone photo, soft natural daylight, warm cream and blush tones, cozy pinterest aesthetic, realistic, slight film grain. No text, no letters, no brand names, no logo, no watermark.`;

const cle = process.env.FAL_API;
if (!cle) throw new Error("FAL_API manquant dans l'environnement");
const h = { Authorization: `Key ${cle}`, "content-type": "application/json" };
const r = await fetch("https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image", {
  method: "POST",
  headers: h,
  body: JSON.stringify({ prompt, image_size: tailles[format], num_images: n }),
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
  const k = Math.min(1, 1170 / img.width);
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const f = join("images", "photos", `${nom}${n > 1 ? `-${i + 1}` : ""}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  console.log(f);
}
