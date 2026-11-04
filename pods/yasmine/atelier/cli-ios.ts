// Usage : npm run ios -- <nom>
//
// Dessine les cinq écrans d'iPhone décrits dans ios/<nom>.json (fond
// d'écran, textes par langue) et les écrit dans assets/ios/<nom>/<langue>/ :
// verrouillage, accueil, aujourdhui, controle, concentration (JPEG 739 × 1600).
// Les slides du post les posent ensuite dans l'iPhone avec `capture`.

import { loadImage } from "@napi-rs/canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accueil, aujourdhui, centreControle, concentration, type TextesIos, verrouillage } from "./ecrans-ios.ts";
import { RACINE } from "./slides.ts";

const nom = process.argv[2];
if (!nom) throw new Error("usage : npm run ios -- <nom>");
const cfg = JSON.parse(readFileSync(join(RACINE, "ios", `${nom}.json`), "utf8")) as { fond: string; langues: Record<string, TextesIos> };

const reponse = await fetch(cfg.fond);
if (!reponse.ok) throw new Error(`fond d'écran : HTTP ${reponse.status}`);
const fond = await loadImage(Buffer.from(await reponse.arrayBuffer()));
const icones = {
  micabo: await loadImage(join(RACINE, "assets/micabo/icone.png")),
  notion: await loadImage(join(RACINE, "assets/applis/notion.jpg")),
  focuspomo: await loadImage(join(RACINE, "assets/applis/focuspomo.jpg")),
  sophia: await loadImage(join(RACINE, "assets/applis/sophia.jpg")),
  unswipe: await loadImage(join(RACINE, "assets/applis/unswipe.jpg")),
};

for (const [langue, t] of Object.entries(cfg.langues)) {
  const dossier = join(RACINE, "assets/ios", nom, langue);
  mkdirSync(dossier, { recursive: true });
  const ic = { ...icones, calendrier: await loadImage(join(RACINE, `assets/applis/calendrier.${langue}.jpg`)) };
  const ecrans = {
    verrouillage: verrouillage(fond, t),
    accueil: accueil(fond, t, ic),
    aujourdhui: aujourdhui(fond, t),
    controle: centreControle(fond, t),
    concentration: concentration(fond, t),
  };
  for (const [cle, cv] of Object.entries(ecrans)) writeFileSync(join(dossier, `${cle}.jpg`), cv.toBuffer("image/jpeg", 92));
  console.log(`${nom} ${langue} : 5 écrans → assets/ios/${nom}/${langue}/`);
}
