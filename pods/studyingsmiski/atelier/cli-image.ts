// Usage :
//   npm run image -- <nom> "<l'objet, en anglais>" [--n 2] [--nb]          un sticker détouré
//   npm run image -- <nom> "<la scène, en anglais>" --fond                 un fond de slide (carré)
//   npm run image -- <nom> "<la scène, en anglais>" --photo                une photo de polaroid
//
// Une image neuve avec Seedream v4 sur fal (0,03 $ l'image, un peu plus avec
// le détourage). La clé vient de l'environnement (FAL_API) et ne s'affiche
// jamais. Réencodée sans métadonnées :
// - un sticker (par défaut) : détouré par BiRefNet, en couleurs (--nb : noir et
//   blanc), images/stickers/<nom>[-<n>].png, 800 px au plus. Son style : de
//   petits objets mignons de la vie d'étudiante (dango, matcha glacé,
//   punaise, écouteurs, fiches bristol, une grenouille en peluche verte) ;
//   écris l'objet seul, le fond blanc et la lumière sont ajoutés ici ;
// - un fond (--fond) : images/fonds/<nom>.jpg, 1080 × 1080 (son ciel bleu en
//   papier plié, l'herbe et la barrière en bas ; ou son papier vert pâle) ;
// - une photo (--photo) : images/photos/<nom>.jpg, 1080 px au plus, pour un
//   polaroid (une rue, un bureau, un café).
// JAMAIS ses personnages : ni Smiski (des figurines de marque), ni Snoopy,
// ni Toro, ni Hello Kitty, ni aucun personnage connu ; jamais une marque ni
// un emballage de marque (ses bonbons Tirol), jamais de texte.
// À REGARDER avant de s'en servir (outil Read) ; une image ratée part à la poubelle.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detourer } from "./detourage.ts";
import { retirerMetadonnees } from "./metadonnees.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<en anglais>" [--n 2] [--nb] [--fond | --photo]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const mode = args.includes("--fond") ? "fond" : args.includes("--photo") ? "photo" : "sticker";
const prompt =
  mode === "fond"
    ? `${scene}. Soft pastel illustration with a scrapbook paper texture, gentle and cozy, square composition. No people, no characters, no text, no letters, no logo, no watermark.`
    : mode === "photo"
      ? `${scene}. Candid phone photo, natural daylight, soft colors, slightly grainy. No people's faces, no text, no letters, no brand logo, no watermark.`
      : `${scene}, a single cute isolated object centered with generous margins, studio photograph, soft even lighting, pure plain white background, no shadow on the background, no text, no letters, no logo, no brand, no watermark`;
const taille = mode === "fond" ? { width: 2048, height: 2048 } : { width: 1440, height: 1440 };

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
for (const [i, im] of res.images.entries()) {
  const suffixe = n > 1 ? `-${i + 1}` : "";
  if (mode === "sticker") {
    mkdirSync(join(racine, "images", "stickers"), { recursive: true });
    const f = join("images", "stickers", `${nom}${suffixe}.png`);
    writeFileSync(join(racine, f), await detourer(im.url, { nb: args.includes("--nb"), max: 800 }));
    console.log(f);
    continue;
  }
  const img = await loadImage(Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  const cote = 1080;
  const k = mode === "fond" ? cote / Math.min(img.width, img.height) : Math.min(1, cote / Math.max(img.width, img.height));
  const c = createCanvas(mode === "fond" ? cote : Math.round(img.width * k), mode === "fond" ? cote : Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, img.width * k, img.height * k);
  const dossier = mode === "fond" ? "fonds" : "photos";
  mkdirSync(join(racine, "images", dossier), { recursive: true });
  const f = join("images", dossier, `${nom}${suffixe}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  console.log(f);
}
