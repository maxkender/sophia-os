// Usage : POD_JETON=… node atelier/cli-deposer.ts <source_id|all> [--essai]
//
// Dépose un ou tous les originaux (originaux/<id>.json) dans la file de
// validation de l'OS. Le label est en voie 1 : chaque dépôt déclare son
// type_bleo (full_test ou declinaison, voir npm run boite), et l'OS le juge
// sur la boîte (famille, génération, quota, accroche voisine).
// Format contrôlé ici avant l'OS (controlerFormat) : 4 slides, la phrase sur
// 1 à 3, la slide Sophia marquée en 4 (texte_sophia).
// Un original en attente est remplacé ; un original déjà validé ou rejeté est
// refusé par l'OS (créer un nouvel id). Préfixes d'images (8 car.) résolus.
// --essai : contrôles locaux seulement, rien n'est envoyé.
import { readdirSync, readFileSync } from "node:fs";
import { appelPod, controlerFormat, declarationBleo, LANGUE_SOURCE, type Original } from "./api.ts";

const [cible] = process.argv.slice(2);
if (!cible) throw new Error("usage : deposer <source_id|all> [--essai]");
const essai = process.argv.includes("--essai");
const r = await appelPod<{ images: { id: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
const fichiers = readdirSync("originaux").filter((f) => f.endsWith(".json") && (cible === "all" || f === `${cible}.json`));
if (!fichiers.length) throw new Error(`aucun original « ${cible} »`);
for (const f of fichiers) {
  const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
  const bleo = declarationBleo(o);
  if ("erreur" in bleo) {
    console.log(`${o.source_id} : REFUSÉ ${bleo.erreur}`);
    continue;
  }
  const format = controlerFormat(o);
  if (format.length) {
    console.log(`${o.source_id} : REFUSÉ ${format.join(" · ")}`);
    continue;
  }
  let horsBanque = "";
  const slides = o.slides.map((s) => {
    const im = r.images.find((i) => i.id === s.media_id || i.id.startsWith(s.media_id));
    if (!im) horsBanque = `#${s.position} : image ${s.media_id} hors banque (ou livrée depuis moins de 14 jours)`;
    return {
      position: s.position,
      media_id: im?.id ?? s.media_id,
      texte_overlay: s.texte_overlay.trim(),
      ...(s.texte_sophia?.trim() ? { texte_sophia: s.texte_sophia.trim() } : {}),
      reference_url: s.reference_url,
    };
  });
  if (horsBanque) {
    console.log(`${o.source_id} : REFUSÉ ${horsBanque}`);
    continue;
  }
  if (essai) {
    console.log(`${o.source_id} : 4 slides, ${bleo.resume}, « ${o.slides.slice(0, 3).map((s) => s.texte_overlay).join(" / ")} », prêt`);
    continue;
  }
  const d = await appelPod<{ id: string }>({
    action: "deposer",
    type: "original",
    source_id: o.source_id,
    titre: o.titre,
    // Une déclinaison s'écrit dans la langue source de son parent (ROUTINE §4.3) : l'original peut la déclarer.
    langue_source: (o as { langue_source?: string }).langue_source ?? LANGUE_SOURCE,
    musique_titre: o.musique_titre ?? null,
    musique_url: o.musique_url ?? null,
    inspirations: o.inspirations ?? [],
    ...bleo.champs,
    slides,
  });
  console.log(`${o.source_id} : ${d.ok ? `déposé (${d.id})` : `REFUSÉ ${d.error}`}`);
}
