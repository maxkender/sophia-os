// Usage :
//   npm run image -- <nom> "<ce qu'on voit, en anglais>" [--n 2] [--format carre|haut] [--couleur]
//
// Une image neuve avec Seedream v4 sur fal (0,03 $ l'image, un peu plus avec
// le détourage), DÉTOURÉE par BiRefNet et passée en noir et blanc (son style ;
// --couleur pour la garder en couleurs) : images/detoures/<nom>[-<n>].png
// (1 000 px au plus). La clé vient de l'environnement (FAL_API) et ne
// s'affiche jamais.
// - un objet (« a black toothbrush », « a folded white t-shirt ») : format
//   `carre`, le fond blanc et la lumière de studio sont ajoutés ici ;
// - un homme (couverture, fin, buste d'un conseil) : `--format haut`, décris la
//   pose (« an athletic shirtless man in side profile, head tilted up ») ; le
//   studio noir et blanc est ajouté ici.
// L'homme qui court de la slide Atala vient de la banque (`npm run photos`
// puis `npm run detourer`), pas d'ici.
// À REGARDER avant de s'en servir (outil Read) ; une image ratée (texte,
// mains ou visage déformés, filigrane) part à la poubelle. Jamais une
// célébrité, jamais un logo de marque.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detourer } from "./detourage.ts";

const args = process.argv.slice(2);
const [nom, scene] = args;
if (!nom || !scene || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error('usage : image <nom-en-minuscules> "<scène en anglais>" [--n 2] [--format carre|haut] [--couleur]');
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const n = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 4);
const nb = !args.includes("--couleur");
const format = opt("--format") ?? "carre";
const tailles: Record<string, { width: number; height: number }> = { carre: { width: 1440, height: 1440 }, haut: { width: 1200, height: 1600 } };
if (!tailles[format]) throw new Error("--format carre ou haut");
const prompt =
  format === "haut"
    ? `${scene}. Black and white studio photograph, high contrast, dramatic soft lighting, pure plain white background, the whole subject in frame. No text, no letters, no logo, no tattoo, no watermark.`
    : `${scene}, a single isolated object centered with generous margins, studio product photograph, soft even lighting, pure plain white background, no shadow on the background, no text, no logo, no watermark`;

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
mkdirSync(join(racine, "images", "detoures"), { recursive: true });
for (const [i, im] of res.images.entries()) {
  const f = join("images", "detoures", `${nom}${n > 1 ? `-${i + 1}` : ""}.png`);
  writeFileSync(join(racine, f), await detourer(im.url, { nb, max: 1000 }));
  console.log(f);
}
