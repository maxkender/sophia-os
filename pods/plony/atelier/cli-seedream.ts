// Usage : node atelier/cli-seedream.ts <nom> "<la scène, en anglais>" [--n 2]
//
// Une image neuve dans le style de la banque (estampe japonaise, matière de
// sérigraphie), avec Seedream v4 sur fal (0,03 $ l'image). La clé vient de
// l'environnement (FAL_API) et ne s'affiche jamais. L'image est réencodée en
// JPEG sans métadonnées (ni C2PA ni XMP) : sortie/seedream/<nom>-<n>.jpg.
//
// La scène dit QUI fait QUOI et OÙ, et laisse un VIDE pour le texte (« empty
// sky in the upper third ») : le style est ajouté ici, ne le répète pas.
// Ce qui marche (essais du 13/11) : un démon en très gros plan coupé par le
// bord, un personnage minuscule face à lui, des cadrages en contre-plongée, une
// créature cachée dans les fleurs, un œil sous la vague. Seedream ajoute parfois
// un petit tampon rouge ou une marge crème : jette l'image et relance.
//
// À REGARDER avant d'en faire quoi que ce soit. Une image neuve n'est pas encore
// dans la banque du label : tant que l'OS n'a pas d'action pour l'y ajouter,
// seules les images de la banque (npm run images, npm run sources) se déposent.
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const STYLE =
  "Edo-period ukiyo-e woodblock print reimagined as a dense modern risograph screen print. Very fine, tight black ink cross-hatching and engraved line shading on every surface, heavy halftone dot screens and stippling, mottled uneven ink, rough handmade washi paper fibers and grain visible everywhere, slight misregistration of the color plates. Limited palette: flat saturated vermilion red, deep cobalt ultramarine blue, mustard yellow, off-white cream, black. Full bleed edge to edge: no border, no frame, no paper margin. No text, no letters, no calligraphy, no signature, no red seal stamp, no watermark.";

const [nom, scene] = process.argv.slice(2);
if (!nom || !scene || !/^[a-z0-9-]{2,40}$/.test(nom)) throw new Error('usage : seedream <nom-en-minuscules> "<scène en anglais>" [--n 2]');
const args = process.argv.slice(2);
const n = Math.min(Math.max(Number(args.includes("--n") ? args[args.indexOf("--n") + 1] : 1) || 1, 1), 4);
const cle = process.env.FAL_API;
if (!cle) throw new Error("FAL_API manquant dans l'environnement");
const h = { Authorization: `Key ${cle}`, "content-type": "application/json" };

const r = await fetch("https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image", {
  method: "POST",
  headers: h,
  body: JSON.stringify({ prompt: `${scene} ${STYLE}`, image_size: { width: 1440, height: 2560 }, num_images: n }),
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
mkdirSync("sortie/seedream", { recursive: true });
for (const [i, im] of res.images.entries()) {
  const brut = Buffer.from(await (await fetch(im.url)).arrayBuffer());
  const img = await loadImage(brut);
  const c = createCanvas(1080, 1920);
  const k = Math.max(1080 / img.width, 1920 / img.height);
  c.getContext("2d").drawImage(img, (1080 - img.width * k) / 2, (1920 - img.height * k) / 2, img.width * k, img.height * k);
  const sortie = `sortie/seedream/${nom}-${i + 1}.jpg`;
  writeFileSync(sortie, c.toBuffer("image/jpeg", 92));
  console.log(sortie);
}
