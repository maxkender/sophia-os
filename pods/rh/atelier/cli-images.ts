// Usage : POD_JETON=… node atelier/cli-images.ts [--accroches] [--depuis <id8,id8…>] [--page N] [--par 48]
//
// Banque d'images propres du label (donnees/images.json) et planches pour
// CHOISIR à l'œil : chaque vignette porte les 8 premiers caractères de son id.
//   --accroches        seulement les images marquées accroche (slide 1)
//   --depuis a,b,c     seulement les images des contenus a, b, c (ids ou préfixes) :
//                      pratique pour repartir des visuels du top
// Sortie : sortie/images/<filtre>-<page>.jpg
import { mkdirSync, writeFileSync } from "node:fs";
import { appelPod } from "./api.ts";
import { planche } from "./planche.ts";

type Image = { id: string; url: string; est_hook: boolean; used_count: number; contenu_id: string | null };
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const r = await appelPod<{ total: number; images: Image[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/images.json", JSON.stringify(r.images, null, 1));

let liste = r.images;
const depuis = opt("--depuis")?.split(",").map((s) => s.trim()).filter(Boolean);
if (depuis) liste = liste.filter((i) => depuis.some((d) => i.contenu_id?.startsWith(d)));
if (args.includes("--accroches")) liste = liste.filter((i) => i.est_hook);
const par = Number(opt("--par") ?? 48);
const page = Number(opt("--page") ?? 1);
const tranche = liste.slice((page - 1) * par, page * par);
const nom = `sortie/images/${depuis ? "depuis" : args.includes("--accroches") ? "accroches" : "toutes"}-${page}.jpg`;
await planche(tranche.map((i) => ({ id: i.id, url: i.url, legende: `${i.id.slice(0, 8)}${i.est_hook ? " ★" : ""}` })), nom, 8, 200);
console.log(`${r.total} images propres · filtre : ${liste.length} · page ${page}/${Math.ceil(liste.length / par)} → ${nom}`);
