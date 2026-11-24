// Usage :
//   npm run image -- <nom> "<la scène, en anglais>" [--n 2]     une photo de loisir (4:3)
//   npm run image -- <nom> "<la vue, en anglais>" --scan        une image de cerveau pour la couverture
//
// Une image neuve avec Seedream v4 sur fal (0,03 $ l'image). La clé vient de
// l'environnement (FAL_API) et ne s'affiche jamais. Réencodée sans
// métadonnées, dans images/photos/<nom>[-<n>].jpg, 1400 px au plus :
// - une photo (par défaut) : le loisir pris sur le vif, comme ses photos de
//   banque (une table de ping-pong, des mains dans la pâte, une chorale vue de
//   dos) ; les visages petits ou de dos ;
// - un cerveau (--scan) : une IRM en coupes sur fond noir avec des zones
//   orange, comme ses couvertures (« neuroscience backed »).
// La photo de la slide Atala (une course) et celle de la slide Artura (un
// tableau, un musée) viennent de la banque de l'OS (`npm run photos`).
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte, mains
// ou visages déformés, filigrane) part à la poubelle. Jamais une célébrité,
// jamais une marque, jamais de texte.
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
  ? `${scene}. Medical MRI brain scan images on a pure black background, grayscale anatomy with a few bright orange and yellow activation spots, clinical research figure style. No text, no letters, no labels, no watermark.`
  : `${scene}. Candid realistic photo, natural light, slightly soft, like a stock photo for a blog. No visible faces in close-up, no text, no letters, no brand logo, no watermark.`;
const taille = { width: 1600, height: 1200 };

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
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const f = join("images", "photos", `${nom}${n > 1 ? `-${i + 1}` : ""}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  console.log(f);
}
