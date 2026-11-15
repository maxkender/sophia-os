// Usage :
//   npm run image -- <nom> "<ce qu'on voit, en anglais>" [--n 2] [--format carre|large|haut]
//   npm run image -- <nom> "<l'objet, en anglais>" --objet [--n 2]
//
// Une image neuve avec Seedream v4 sur fal (0,03 $ l'image, un peu plus avec le détourage). La clé vient de
// l'environnement (FAL_API) et ne s'affiche jamais. Réencodée sans
// métadonnées (ni C2PA ni XMP) :
// - une image d'item ou de couverture : images/<nom>[-<n>].jpg (1 080 px au plus) ;
// - avec --objet, un objet seul détouré pour l'iceberg : images/objets/<nom>[-<n>].png
//   (détouré par BiRefNet sur fal, 400 px au plus). Écris l'objet seul (« a stack of old
//   leather books », « a black chess pawn ») : le fond blanc et la lumière de
//   studio sont ajoutés ici.
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte,
// visage déformé, filigrane) part à la poubelle. Jamais une célébrité, jamais
// un logo de marque.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<scène en anglais>" [--objet] [--n 2] [--format carre|large|haut]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const objet = args.includes("--objet");
const format = opt("--format") ?? (objet ? "carre" : "haut");
const tailles: Record<string, { width: number; height: number }> = { carre: { width: 1440, height: 1440 }, large: { width: 1920, height: 1080 }, haut: { width: 1200, height: 1600 } };
if (!tailles[format]) throw new Error("--format carre, large ou haut");
const prompt = objet
  ? `${scene}, a single isolated object centered with generous margins, studio product photograph, soft even lighting, pure plain white background, no shadow on the background, no text, no logo, no watermark`
  : `${scene}. No text, no letters, no watermark, no logo.`;

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
for (const [i, im] of res.images.entries()) {
  const img = await loadImage(Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  const suffixe = n > 1 ? `-${i + 1}` : "";
  if (!objet) {
    const k = Math.min(1, 1080 / Math.max(img.width, img.height));
    const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    mkdirSync(join(racine, "images"), { recursive: true });
    const f = join("images", `${nom}${suffixe}.jpg`);
    writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
    console.log(f);
    continue;
  }
  // Détourage par BiRefNet sur fal (le fond et son ombre partent), puis recadrage sur l'objet.
  const d = await fetch("https://queue.fal.run/fal-ai/birefnet/v2", { method: "POST", headers: h, body: JSON.stringify({ image_url: im.url }) });
  if (!d.ok) throw new Error(`fal (détourage) : HTTP ${d.status} ${(await d.text()).slice(0, 200)}`);
  const qd = (await d.json()) as { status_url: string; response_url: string };
  for (let k = 0; k < 60; k++) {
    await new Promise((s) => setTimeout(s, 2000));
    const st = (await (await fetch(qd.status_url, { headers: h })).json()) as { status: string };
    if (st.status === "COMPLETED") break;
  }
  const rd = (await (await fetch(qd.response_url, { headers: h })).json()) as { image?: { url: string } };
  if (!rd.image?.url) throw new Error(`fal (détourage) : pas d'image (${JSON.stringify(rd).slice(0, 200)})`);
  const det = await loadImage(Buffer.from(await (await fetch(rd.image.url)).arrayBuffer()));
  const W = det.width;
  const Hh = det.height;
  const c = createCanvas(W, Hh);
  const g = c.getContext("2d");
  g.drawImage(det, 0, 0);
  const px = g.getImageData(0, 0, W, Hh).data;
  let x0 = W;
  let x1 = 0;
  let y0 = Hh;
  let y1 = 0;
  for (let p = 0; p < W * Hh; p++) {
    if (px[p * 4 + 3] < 24) continue;
    const x = p % W;
    const y = (p - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 <= x0 || y1 <= y0) throw new Error(`${nom} : rien à détourer`);
  const k = Math.min(1, 400 / Math.max(x1 - x0 + 1, y1 - y0 + 1));
  const out = createCanvas(Math.round((x1 - x0 + 1) * k), Math.round((y1 - y0 + 1) * k));
  out.getContext("2d").drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  mkdirSync(join(racine, "images", "objets"), { recursive: true });
  const f = join("images", "objets", `${nom}${suffixe}.png`);
  writeFileSync(join(racine, f), out.toBuffer("image/png"));
  console.log(f);
}
