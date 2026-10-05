// Usage : POD_JETON=… node atelier/cli-apercu.ts <source_id|all>
// Aperçu d'un original (originaux/<id>.json) : ses slides, texte posé sur
// l'image, en une planche sortie/apercus/<id>.jpg. À REGARDER avant de déposer.
// Accepte un id d'image complet ou son préfixe de 8 caractères.
import { readdirSync, readFileSync } from "node:fs";
import { appelPod, type Original } from "./api.ts";
import { planche } from "./planche.ts";

const cible = process.argv[2];
if (!cible) throw new Error("usage : apercu <source_id|all>");
const r = await appelPod<{ images: { id: string; url: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
const fichiers = readdirSync("originaux").filter((f) => f.endsWith(".json") && (cible === "all" || f === `${cible}.json`));
for (const f of fichiers) {
  const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
  const cases = o.slides
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const im = r.images.find((i) => i.id === s.media_id || i.id.startsWith(s.media_id));
      if (!im) throw new Error(`${o.source_id} #${s.position} : image ${s.media_id} hors banque`);
      return { id: im.id, url: im.url, texte: s.texte_overlay, legende: `#${s.position} ${s.texte_overlay.length} car.` };
    });
  await planche(cases, `sortie/apercus/${o.source_id}.jpg`, 6, 300);
  console.log(`sortie/apercus/${o.source_id}.jpg`);
}
