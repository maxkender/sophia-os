// Usage : POD_JETON=… node atelier/cli-couvertures.ts [--n 20] [--planche]
//
// Couvertures NEUVES pour la slide 1 : images marquées accroche dans la banque
// du label qui ne servent de slide 1 à aucun original, et slides 1
// d'inspiration (medias/brut/<post>/1.jpg) jamais reprises. Avec --planche,
// fait une planche des images proposées (sortie/images/couvertures.jpg) à lire
// avec Read avant de choisir (texte jaune lisible, pas de femme reconnaissable).
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { appelPod, type Original } from "./api.ts";
import { planche } from "./planche.ts";

const args = process.argv.slice(2);
const n = Number(args.includes("--n") ? args[args.indexOf("--n") + 1] : 20);
const BRUT = "https://mbikecieskoobeizixig.supabase.co/storage/v1/object/public/medias/brut/";

const originaux = readdirSync("originaux")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original);
const prisesMedia = new Set(originaux.flatMap((o) => o.slides.filter((s) => s.position === 1).map((s) => s.media_id.slice(0, 8))));
const utilisees = new Set(originaux.flatMap((o) => o.slides.map((s) => s.media_id.slice(0, 8))));
const prisesRef = new Set(originaux.flatMap((o) => o.slides.filter((s) => s.position === 1).map((s) => s.reference_url)));

type Image = { id: string; url: string; est_hook: boolean; used_count: number; contenu_id: string | null };
const r = await appelPod<{ images: Image[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
const libres = r.images
  .filter((i) => i.est_hook && !prisesMedia.has(i.id.slice(0, 8)))
  .sort((a, b) => Number(utilisees.has(a.id.slice(0, 8))) - Number(utilisees.has(b.id.slice(0, 8))) || a.used_count - b.used_count)
  .slice(0, n);

const label = JSON.parse(readFileSync("donnees/label.json", "utf8")) as { compte_source: string | null; source_url: string | null }[];
const refs = label
  .map((c) => ({ compte: c.compte_source, v: /\/video\/(\d+)/.exec(c.source_url ?? "")?.[1] }))
  .filter((c) => c.v)
  .map((c) => ({ compte: c.compte, url: `${BRUT}${c.v}/1.jpg` }))
  .filter((c) => !prisesRef.has(c.url))
  .sort((a, b) => Number(b.compte === "stonemag.co") - Number(a.compte === "stonemag.co"))
  .slice(0, n);

console.log(`Couvertures libres (${libres.length}) :`);
for (const i of libres) console.log(`  ${i.id.slice(0, 8)}${utilisees.has(i.id.slice(0, 8)) ? " (déjà vue dans un deck)" : ""}`);
console.log(`\nSlides 1 d'inspiration libres (${refs.length}) :`);
for (const c of refs) console.log(`  @${c.compte} ${c.url}`);
if (args.includes("--planche")) {
  mkdirSync("sortie/images", { recursive: true });
  await planche(libres.map((i) => ({ id: i.id.slice(0, 8), url: i.url, legende: i.id.slice(0, 8) })), "sortie/images/couvertures.jpg", 8, 220, "cover");
  console.log("\nPlanche : sortie/images/couvertures.jpg");
}
