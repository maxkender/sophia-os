// Usage : npm run original -- <mm-oNNN> [--langues en,fr] [--essai <dossier> | --deposer]
//
// Rend un original (originaux/<id>.json) dans chaque langue :
// sortie/originaux/<id>/<langue>/<n>.jpg et la planche sortie/apercus/<id>.jpg
// (une rangée par langue). --deposer le dépose dans la file de validation
// (POD_JETON) ; --essai écrit le corps de la requête sur disque.
//
// Dépôt « images finies » SANS source_url ni vues : la fonction `pods` le
// prend pour un original et, validé, il entre au rang original. Musique : celle
// du post le plus vu du compte.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { appelPod, LANGUE_SOURCE, LANGUES, lireManifeste, POD, type Langue } from "./api.ts";
import { CHEMIN_ICONE } from "./app.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { rendreCarrousel, textesCarrousel, type Carrousel } from "./carrousel.ts";
import { estOriginal, lireOriginal, rendreOriginal, textesOriginal, type Original } from "./original.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id || !estOriginal(id)) throw new Error("usage : npm run original -- <mm-oNNN> [--langues en,fr] [--essai <dossier> | --deposer]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const langues = (opt("--langues")?.split(",") ?? [...LANGUES]) as Langue[];
const essai = opt("--essai");
const deposer = args.includes("--deposer");

// Deux formats : la tier list (couverture + tableau) et le carrousel (un item par slide).
const o = lireOriginal(id) as Original | Carrousel;
const carrousel = "format" in o && o.format === "carrousel";
/** Slide de l'élément UnSwipe : la 2e pour une tier list, celle de son item pour un carrousel. */
const positionApp = carrousel ? (o as Carrousel).items.findIndex((it) => "app" in it) + 2 : (o as Original).position_app;
if (positionApp < 2) throw new Error(`${id} : pas d'élément UnSwipe (jamais sur la couverture)`);
const icone = await loadImage(CHEMIN_ICONE);
const decks: Record<string, { hashtags: string; slides: { position: number; jpeg_base64: string; position_app?: true }[] }> = {};
const rendus: Record<string, Buffer[]> = {};
for (const langue of langues) {
  const jpegs = carrousel ? await rendreCarrousel(o as Carrousel, langue, icone) : await rendreOriginal(o as Original, langue, icone);
  const dossier = `sortie/originaux/${id}/${langue}`;
  mkdirSync(dossier, { recursive: true });
  jpegs.forEach((j, i) => {
    const restes = metadonneesRestantes(j);
    if (restes.length) throw new Error(`${langue} #${i + 1} : métadonnées ${restes.join(", ")}`);
    writeFileSync(`${dossier}/${i + 1}.jpg`, j);
  });
  rendus[langue] = jpegs;
  decks[langue] = {
    hashtags: o.legendes[langue],
    slides: jpegs.map((j, i) => ({ position: i + 1, jpeg_base64: j.toString("base64"), ...(i + 1 === positionApp ? { position_app: true as const } : {}) })),
  };
}

// Planche : une rangée par langue, toutes les slides.
const parRangee = Math.max(...langues.map((l) => rendus[l].length));
const planche = createCanvas(parRangee * 432, langues.length * 540);
const px = planche.getContext("2d");
for (const [i, langue] of langues.entries()) {
  for (const [n, j] of rendus[langue].entries()) px.drawImage(await loadImage(j), n * 432, i * 540, 432, 540);
}
mkdirSync("sortie/apercus", { recursive: true });
writeFileSync(`sortie/apercus/${id}.jpg`, await planche.encode("jpeg", 85));
console.log(`${id} : sortie/originaux/${id}/ · planche sortie/apercus/${id}.jpg`);

if (essai || deposer) {
  if (!decks[LANGUE_SOURCE]) throw new Error(`pas de deck en ${LANGUE_SOURCE} (langue source) : rien déposé`);
  const top = [...lireManifeste().posts].sort((a, b) => b.vues - a.vues)[0];
  const corps = {
    action: "deposer",
    pod: POD,
    source_id: id,
    titre: o.titre.slice(0, 160),
    langue_source: LANGUE_SOURCE,
    musique_url: top?.musique.url ?? null,
    musique_titre: top?.musique.titre ?? null,
    textes: carrousel ? textesCarrousel(o as Carrousel) : textesOriginal(o as Original),
    decks,
  };
  if (essai) {
    mkdirSync(essai, { recursive: true });
    writeFileSync(join(essai, `${id}.depot.json`), JSON.stringify(corps));
    console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(",")})`);
  } else {
    const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
    if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
    console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(",")} · applications ${JSON.stringify(r.applications)}`);
  }
}
