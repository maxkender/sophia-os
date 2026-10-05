// Usage : POD_JETON=… node atelier/cli-deposer.ts <source_id|all> [--essai]
// Dépose un ou tous les originaux (originaux/<id>.json) dans la file de
// validation de l'OS. Un original en attente est remplacé ; un original déjà
// validé ou rejeté est refusé par l'OS (créer un nouvel id).
// Les préfixes d'images (8 caractères) sont résolus en ids complets.
import { readdirSync, readFileSync } from "node:fs";
import { appelPod, type Original } from "./api.ts";

const [cible] = process.argv.slice(2);
if (!cible) throw new Error("usage : deposer <source_id|all> [--essai]");
const r = await appelPod<{ images: { id: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
const fichiers = readdirSync("originaux").filter((f) => f.endsWith(".json") && (cible === "all" || f === `${cible}.json`));
if (!fichiers.length) throw new Error(`aucun original « ${cible} »`);
for (const f of fichiers) {
  const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
  const slides = o.slides.map((s) => {
    const im = r.images.find((i) => i.id === s.media_id || i.id.startsWith(s.media_id));
    if (!im) throw new Error(`${o.source_id} #${s.position} : image ${s.media_id} hors banque`);
    return { position: s.position, media_id: im.id, texte_overlay: s.texte_overlay };
  });
  if (process.argv.includes("--essai")) {
    console.log(`${o.source_id} : ${slides.length} slides, prêt`);
    continue;
  }
  const d = await appelPod<{ id: string }>({
    action: "deposer",
    type: "original",
    source_id: o.source_id,
    titre: o.titre,
    langue_source: "en",
    musique_titre: o.musique_titre ?? null,
    musique_url: o.musique_url ?? null,
    inspirations: o.inspirations ?? [],
    slides,
  });
  console.log(`${o.source_id} : ${d.ok ? `déposé (${d.id})` : `REFUSÉ ${d.error}`}`);
}
