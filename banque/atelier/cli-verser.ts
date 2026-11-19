// Usage : BANQUE_JETON=… node atelier/cli-verser.ts --labels male_run[,clean_girl_run] [--planche 3] [--essai] <decisions.json>
//
// Verse dans la banque les images GARDÉES au tri. Le fichier de décisions est
// une liste, une ligne par image gardée :
//   [{ "ref": "549690", "legende": "man running alone on a foggy road at dawn, seen from behind",
//      "cadrage": "centre", "labels": ["male_run"], "visage": false }]
//   - ref      les 6 caractères de la planche ;
//   - legende  l'image décrite en anglais (qui, quoi, où, lumière) : c'est elle
//              que les podz lisent avec images --cherche ;
//   - cadrage  centre (défaut) | haut | bas | gauche | droite : où caler le 9:16 ;
//   - labels   seulement si cette image va ailleurs que --labels ;
//   - visage   true si un visage est reconnaissable (l'OS ne la proposera ni en
//              photo de profil ni aux autres labels).
//   --planche N  règle la planche : ses images absentes du fichier sont écartées
//                et ne reviendront plus au tri.
//   --essai      ne verse rien : écrit les images recadrées dans sortie/verser/
//                pour les regarder (pas besoin de BANQUE_JETON).
//
// Chaque image est téléchargée en taille d'origine, recadrée en 9:16, ramenée à
// 1080 px de large au plus et réencodée en JPEG sans métadonnées.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { metadonneesRestantes, retirerMetadonnees } from "../../pods/page-blanche/atelier/metadonnees.ts";
import { PLANCHES, STOCK, appelBanque, ecrire, lire, lireStock } from "./api.ts";
import { tailleSortie, trouver, verifierDecisions, zone } from "./pinterest.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const essai = args.includes("--essai");
const labelsDefaut = (opt("--labels") ?? "").split(",").map((l) => l.trim()).filter(Boolean);
const planche = opt("--planche");
const fichier = args.find((a, i) => a.endsWith(".json") && !["--labels", "--planche"].includes(args[i - 1]));
if (!fichier) throw new Error("usage : verser --labels male_run[,…] [--planche N] [--essai] <decisions.json>");

const { decisions, erreurs } = verifierDecisions(JSON.parse(readFileSync(fichier, "utf8")));
const stock = lireStock();
const planches = lire<Record<string, { le: string; refs: string[] }>>(PLANCHES, {});
if (planche && !planches[planche]) erreurs.push(`planche ${planche} inconnue`);
const lignes = decisions.flatMap((d) => {
  try {
    const candidat = trouver(stock, d.ref);
    const labels = d.labels ?? labelsDefaut;
    if (!labels.length) erreurs.push(`${d.ref} : aucun label (--labels male_run, ou "labels" sur la ligne)`);
    if (planche && planches[planche] && !planches[planche].refs.includes(candidat.ref)) erreurs.push(`${d.ref} : pas sur la planche ${planche}`);
    return [{ d, candidat, labels }];
  } catch (e) {
    erreurs.push(e instanceof Error ? e.message : String(e));
    return [];
  }
});
if (erreurs.length) {
  console.error(`Rien n'est versé, ${erreurs.length} erreur(s) :\n- ${erreurs.join("\n- ")}`);
  process.exit(1);
}

async function recadrer(url: string, cadrage: Parameters<typeof zone>[2]): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`téléchargement : HTTP ${r.status}`);
  const im = await loadImage(Buffer.from(await r.arrayBuffer()));
  const z = zone(im.width, im.height, cadrage);
  const t = tailleSortie(im.width, im.height);
  const c = createCanvas(t.l, t.h);
  c.getContext("2d").drawImage(im, z.x, z.y, z.l, z.h, 0, 0, t.l, t.h);
  // Le canevas joint un profil de couleur (APP2) : l'OS refuse toute métadonnée.
  const jpeg = retirerMetadonnees(c.toBuffer("image/jpeg", 92));
  const restes = metadonneesRestantes(jpeg);
  if (restes.length) throw new Error(`métadonnées restantes : ${restes.join(", ")}`);
  return jpeg;
}

let versees = 0;
let deja = 0;
let refusees = 0;
let quota = false;
if (essai) mkdirSync("sortie/verser", { recursive: true });
for (const { d, candidat, labels } of lignes) {
  const court = candidat.ref.slice(0, 6);
  if (quota) break;
  try {
    const jpeg = await recadrer(candidat.image_url, d.cadrage);
    if (essai) {
      writeFileSync(`sortie/verser/${court}.jpg`, jpeg);
      console.log(`${court} : sortie/verser/${court}.jpg (${(jpeg.length / 1000).toFixed(0)} ko) → ${labels.join(", ")}`);
      continue;
    }
    const r = await appelBanque<{ id: string; url: string; deja?: boolean }>({
      action: "ajouter",
      labels,
      jpeg_base64: jpeg.toString("base64"),
      legende: d.legende,
      ...(d.visage ? { visage: true } : {}),
      origine: { site: "pinterest", image_url: candidat.image_url, ...(candidat.page_url ? { page_url: candidat.page_url } : {}), requete: candidat.requetes[0]?.slice(0, 200) },
    });
    if (!r.ok) {
      if (r.code === "quota_images") quota = true;
      refusees += 1;
      console.log(`${court} : REFUSÉ ${r.error}`);
      continue;
    }
    candidat.decision = "versee";
    candidat.motif = r.id;
    if (r.deja) deja += 1;
    else versees += 1;
    console.log(`${court} : ${r.deja ? "déjà en banque, labels complétés" : "en banque"} (${r.id.slice(0, 8)}) → ${labels.join(", ")}`);
  } catch (e) {
    refusees += 1;
    console.log(`${court} : ÉCHEC ${e instanceof Error ? e.message : e}`);
  }
}

let ecartees = 0;
if (!essai && planche && !refusees) {
  for (const ref of planches[planche].refs) {
    const c = stock[ref];
    if (c && !c.decision) {
      c.decision = "ecartee";
      c.motif = `tri de la planche ${planche}`;
      ecartees += 1;
    }
  }
}
if (!essai) ecrire(STOCK, stock);
console.log(
  essai
    ? `Essai : ${lignes.length} image(s) recadrée(s) dans sortie/verser/, rien de versé.`
    : `${versees} versée(s), ${deja} déjà en banque, ${refusees} refusée(s)${planche ? (refusees ? ` · planche ${planche} laissée ouverte (corrige et relance)` : `, ${ecartees} écartée(s) : planche ${planche} réglée`) : ""}${quota ? " · quota du jour atteint" : ""}`,
);
if (refusees) process.exitCode = 1;
