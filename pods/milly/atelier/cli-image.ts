// Usage :
//   npm run image -- <nom> "<ce qu'on voit, en anglais>" [--n 2] [--format large|carre|haut]
//
// Une petite image neuve pour une slide, avec Seedream v4 sur fal (0,03 $
// l'image). La clé vient de l'environnement (FAL_API) et ne s'affiche jamais.
// Format `large` par défaut (1280 × 1120, celui de ses images de couverture),
// `carre` (1024 × 1024), `haut` (1024 × 1280). Réencodée sans métadonnées (ni
// C2PA ni XMP) dans images/<nom>[-<n>].jpg, 900 px de large au plus.
//
// Son style : de l'imagerie de neurosciences (IRM du cerveau en coupe, IRM
// fonctionnelle en couleurs, neurones, schémas de synapses) sur fond noir ou
// blanc, comme une figure de manuel. Le style est ajouté ici : décris
// seulement ce qu'on voit (« a sagittal MRI scan of a human brain »).
// Les molécules (caféine, L-théanine…) : pas de Seedream, qui invente des
// formules ; prends la figure 2D de PubChem (domaine public, NCBI) avec
// `npm run molecule`.
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte,
// lettres, logo, filigrane, anatomie absurde) part à la poubelle.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<scène en anglais>" [--n 2] [--format large|carre|haut]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const format = opt("--format") ?? "large";
const tailles: Record<string, { width: number; height: number }> = { large: { width: 1280, height: 1120 }, carre: { width: 1024, height: 1024 }, haut: { width: 1024, height: 1280 } };
if (!tailles[format]) throw new Error("--format large, carre ou haut");
const prompt = `${scene}. Scientific neuroscience imaging, like a figure from a medical textbook or a research paper, high detail, realistic. No text, no letters, no labels, no numbers, no logo, no watermark.`;

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
mkdirSync(join(racine, "images"), { recursive: true });
for (const [i, im] of res.images.entries()) {
  const img = await loadImage(Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  const k = Math.min(1, 900 / img.width);
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const f = join("images", `${nom}${n > 1 ? `-${i + 1}` : ""}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  console.log(f);
}
