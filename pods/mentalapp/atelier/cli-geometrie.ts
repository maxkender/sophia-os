// Usage : npm run geometrie -- <id> [--refaire | --maj]
//
// Lit la géométrie de chaque slide du post (sources/<id>/<n>.jpg) : blocs de
// texte (t1, t2…) et images (i1, i2…). Écrit une image annotée par slide dans
// sortie/geometrie/<id>/<n>.png, à regarder avec l'outil Read, et le squelette
// de la transcription posts/<id>.json s'il n'existe pas.
//   --refaire : réécrit le squelette (textes perdus) ;
//   --maj     : garde les textes et les actions, met à jour la géométrie de
//               chaque bloc (boîtes, lignes, fond, espace libre) d'après le
//               bloc détecté qui le recouvre le plus. Les blocs manuels (m…)
//               ne bougent pas.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { analyserSlide } from "./geometrie.ts";
import { cheminTranscription, ecrireTranscription, lireTranscription, type Transcription } from "./transcription.ts";
import type { Boite } from "./geometrie.ts";
import { lireManifeste } from "./api.ts";

const [id] = process.argv.slice(2);
if (!id) throw new Error("usage : npm run geometrie -- <id> [--refaire]");
const refaire = process.argv.includes("--refaire");
const dossier = `sources/${id}`;
if (!existsSync(dossier)) throw new Error(`${dossier} absent : lance npm run releve`);
const positions = readdirSync(dossier)
  .map((f) => Number(f.replace(".jpg", "")))
  .filter(Number.isInteger)
  .sort((a, b) => a - b);

const sortie = `sortie/geometrie/${id}`;
mkdirSync(sortie, { recursive: true });
const slides: Transcription["slides"] = [];
for (const n of positions) {
  const chemin = `${dossier}/${n}.jpg`;
  const geo = await analyserSlide(chemin);
  const img = await loadImage(chemin);
  const c = createCanvas(geo.largeur, geo.hauteur);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.lineWidth = 2;
  ctx.font = "bold 20px sans-serif";
  for (const im of geo.images) {
    ctx.strokeStyle = "rgba(0,90,255,0.7)";
    ctx.strokeRect(...im.boite);
    ctx.fillStyle = "rgba(0,90,255,0.9)";
    ctx.fillText(im.id, im.boite[0] + 2, im.boite[1] + 18);
  }
  for (const b of geo.blocs) {
    ctx.strokeStyle = b.probable === "texte" ? "rgba(230,0,0,0.9)" : "rgba(150,150,150,0.8)";
    ctx.strokeRect(b.boite[0] - 2, b.boite[1] - 2, b.boite[2] + 4, b.boite[3] + 4);
    ctx.fillStyle = b.probable === "texte" ? "rgba(230,0,0,1)" : "rgba(120,120,120,1)";
    ctx.fillText(b.id, b.boite[0] + b.boite[2] + 3, b.boite[1] + 16);
  }
  writeFileSync(`${sortie}/${n}.png`, await c.encode("png"));
  console.log(`\nslide ${n} (${geo.largeur}×${geo.hauteur}, fond ${geo.fond}) → ${sortie}/${n}.png`);
  for (const b of geo.blocs) {
    console.log(`  ${b.id} [${b.boite.join(",")}] ${b.probable} · ${b.lignes.length} ligne(s) · ${b.alignement} · texte ${b.couleur} sur ${b.fond}`);
  }
  console.log(`  images : ${geo.images.map((i) => `${i.id} [${i.boite.join(",")}]`).join(" · ")}`);
  slides.push({
    position: n,
    blocs: geo.blocs.map((b) => ({ ...b, action: b.probable === "texte" ? ("traduire" as const) : ("garder" as const), en: [], textes: {} })),
  });
}

const maj = process.argv.includes("--maj");
if (maj && existsSync(cheminTranscription(id))) {
  const t = lireTranscription(id);
  const recouvrement = (a: Boite, b: Boite) => {
    const l = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    if (l <= 0 || h <= 0) return 0;
    return (l * h) / (a[2] * a[3] + b[2] * b[3] - l * h);
  };
  let n = 0;
  for (const s of t.slides) {
    const neufs = slides.find((x) => x.position === s.position)?.blocs ?? [];
    for (const b of s.blocs) {
      if (b.id.startsWith("m")) continue;
      const meilleur = neufs.map((x) => ({ x, r: recouvrement(b.boite, x.boite) })).sort((p, q) => q.r - p.r)[0];
      if (!meilleur || meilleur.r < 0.6) {
        console.log(`  ⚠ ${s.position} ${b.id} : plus détecté, géométrie gardée`);
        continue;
      }
      const { boite, lignes, fond, libre, couleur } = meilleur.x;
      Object.assign(b, { boite, lignes, fond, libre, couleur });
      n++;
    }
  }
  ecrireTranscription(t);
  console.log(`\n${cheminTranscription(id)} : géométrie mise à jour pour ${n} bloc(s), textes gardés`);
} else if (!existsSync(cheminTranscription(id)) || refaire) {
  const post = lireManifeste().posts.find((p) => p.id === id);
  ecrireTranscription({
    source_id: id,
    format: "tier-list",
    titre: "",
    legendes: {},
    app: null,
    slides,
    notes: post ? `source : ${post.url} · ${post.vues} vues · « ${post.legende.slice(0, 120)} »` : "",
  });
  console.log(`\nsquelette écrit : ${cheminTranscription(id)} (à remplir : en, textes, actions, app, titre, légendes)`);
} else {
  console.log(`\n${cheminTranscription(id)} existe déjà : inchangé (--maj pour mettre la géométrie à jour, --refaire pour le réécrire)`);
}
