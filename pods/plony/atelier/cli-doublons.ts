// Usage : POD_JETON=… node atelier/cli-doublons.ts <source_id…>
//
// Signale un titre de slide 1 ou une couverture (même photo, même sous un
// autre media_id) déjà pris par un autre original de originaux/ : texte
// normalisé, et empreinte de l'image (dHash 64 bits, distance ≤ 10 = même
// photo). Informatif : une reprise est permise (§4.7 de pods/ROUTINE.md) si
// elle change quelque chose (items, angle, image ou CTA). Seule une copie
// identique (mêmes images et mêmes textes sur toutes les slides) est refusée.
import { readFileSync, readdirSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { appelPod } from "./api.ts";
import { image } from "./planche.ts";

type Original = { source_id: string; slides: { media_id: string; texte_overlay: string }[] };
const cibles = process.argv.slice(2);
if (!cibles.length) throw new Error("usage : doublons <source_id…>");

const r = await appelPod<{ images: { id: string; url: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
const url = new Map(r.images.map((i) => [i.id.slice(0, 8), i]));

async function empreinte(mediaId: string): Promise<bigint> {
  const img = url.get(mediaId.slice(0, 8));
  if (!img) throw new Error(`image ${mediaId} absente de la banque`);
  const c = createCanvas(9, 8);
  const ctx = c.getContext("2d");
  ctx.drawImage(await loadImage(await image(img.id, img.url)), 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gris = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  };
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (gris(x, y) < gris(x + 1, y)) h |= 1n << BigInt(y * 8 + x);
  return h;
}
const distance = (a: bigint, b: bigint) => (a ^ b).toString(2).split("1").length - 1;
const titre = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const originaux = readdirSync("originaux")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original);
const couv = new Map<string, bigint>();
for (const o of originaux) couv.set(o.source_id, await empreinte(o.slides[0].media_id));

let doublons = 0;
let copies = 0;
const signature = (o: Original) => o.slides.map((s) => `${s.media_id.slice(0, 8)}|${titre(s.texte_overlay)}`).join("\n");
for (const id of cibles) {
  const o = originaux.find((x) => x.source_id === id);
  if (!o) throw new Error(`${id} absent de originaux/`);
  const avant = doublons;
  const copie = originaux.find((x) => x.source_id !== id && signature(x) === signature(o));
  if (copie) {
    console.log(`${id} : COPIE IDENTIQUE de ${copie.source_id} (mêmes images, mêmes textes sur toutes les slides) : refusé`);
    copies++;
  }
  for (const autre of originaux) {
    if (autre.source_id === id) continue;
    if (titre(autre.slides[0].texte_overlay) === titre(o.slides[0].texte_overlay)) {
      console.log(`${id} : même titre de slide 1 que ${autre.source_id}`);
      doublons++;
    }
    const d = distance(couv.get(id)!, couv.get(autre.source_id)!);
    if (d <= 10) {
      console.log(`${id} : même couverture que ${autre.source_id} (${o.slides[0].media_id} ≈ ${autre.slides[0].media_id}, distance ${d})`);
      doublons++;
    }
  }
  if (doublons === avant) console.log(`${id} : ni titre ni couverture en double`);
}
if (copies) process.exit(1);
if (doublons) console.log(`\n${doublons} reprise(s) : permis, à condition que chaque post change quelque chose (items, angle, image ou CTA).`);
