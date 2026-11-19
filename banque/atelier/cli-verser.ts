// Usage : BANQUE_JETON=… node atelier/cli-verser.ts --labels male_run[,clean_girl_run] [--planche 3] [--essai] <decisions.json>
//
// Verse dans la banque les images GARDÉES au tri. Le fichier de décisions est
// une liste, une ligne par image gardée : son empreinte seule, ou un objet.
//   ["c4dfbf", { "ref": "f3ff1e", "cadrage": "haut", "visage": true, "labels": ["male_run"] }]
//   - ref      les 6 caractères de la planche ;
//   - cadrage  centre (défaut) | haut | bas | gauche | droite : où caler le 9:16 ;
//   - labels   seulement si cette image va ailleurs que --labels ;
//   - visage   true si un visage est reconnaissable (l'OS ne la proposera ni en
//              photo de profil ni aux autres labels) ;
//   - legende  facultative, en anglais : l'OS décrit lui-même chaque image
//              versée (Florence, puis Moondream), comme à l'import d'une
//              source. La tienne ne sert que si l'OS n'en rend aucune.
//   --planche N  règle la planche : ses images absentes du fichier sont écartées
//                et ne reviendront plus au tri.
//   --parallele N  images traitées en même temps (3 par défaut, 6 au plus) :
//                la description de l'OS prend quelques secondes par image.
//   --essai      ne verse rien : écrit les images recadrées dans
//                sortie/verser/<nom du fichier>/ et leur planche apercu.jpg, à
//                REGARDER en grand avant de verser (pas besoin de BANQUE_JETON).
//
// Chaque image est téléchargée en taille d'origine, recadrée en 9:16, ramenée à
// 1080 px de large au plus et réencodée en JPEG sans aucune métadonnée (l'OS
// refuse un fichier qui en porte). Rien d'autre ne passe dessus : ni nettoyage,
// ni retouche, ni agrandissement.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { metadonneesRestantes, retirerMetadonnees } from "../../pods/page-blanche/atelier/metadonnees.ts";
import { PLANCHES, STOCK, appelBanque, ecrire, lire, lireStock } from "./api.ts";
import { tailleSortie, trouver, verifierDecisions, zone } from "./pinterest.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const essai = args.includes("--essai");
const labelsDefaut = (opt("--labels") ?? "").split(",").map((l) => l.trim()).filter(Boolean);
const planche = opt("--planche");
const parallele = Math.min(Math.max(Number(opt("--parallele") ?? 3) || 3, 1), 6);
const fichier = args.find((a, i) => a.endsWith(".json") && !["--labels", "--planche", "--parallele"].includes(args[i - 1]));
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
let sansDescription = 0;
const dossierEssai = `sortie/verser/${basename(fichier, ".json")}`;
const apercus: { rang: number; court: string; jpeg: Buffer; note: string }[] = [];
if (essai) mkdirSync(dossierEssai, { recursive: true });
async function traiter({ d, candidat, labels }: (typeof lignes)[number], rang: number): Promise<void> {
  const court = candidat.ref.slice(0, 6);
  if (quota) return;
  try {
    const jpeg = await recadrer(candidat.image_url, d.cadrage);
    if (essai) {
      writeFileSync(`${dossierEssai}/${court}.jpg`, jpeg);
      apercus.push({ rang, court, jpeg, note: `${d.cadrage && d.cadrage !== "centre" ? ` ${d.cadrage}` : ""}${d.visage ? " visage" : ""}` });
      return;
    }
    const r = await appelBanque<{ id: string; url: string; deja?: boolean; description?: string | null; description_par?: string }>({
      action: "ajouter",
      labels,
      jpeg_base64: jpeg.toString("base64"),
      ...(d.legende ? { legende: d.legende } : {}),
      ...(d.visage ? { visage: true } : {}),
      origine: { site: "pinterest", image_url: candidat.image_url, ...(candidat.page_url ? { page_url: candidat.page_url } : {}), requete: candidat.requetes[0]?.slice(0, 200) },
    });
    if (!r.ok) {
      if (r.code === "quota_images") quota = true;
      refusees += 1;
      console.log(`${court} : REFUSÉ ${r.error}`);
      return;
    }
    candidat.decision = "versee";
    candidat.motif = r.id;
    if (r.deja) deja += 1;
    else versees += 1;
    if (!r.deja && !r.description) sansDescription += 1;
    console.log(
      `${court} : ${r.deja ? "déjà en banque, labels complétés" : "en banque"} (${r.id.slice(0, 8)}) → ${labels.join(", ")}` +
        (r.deja ? "" : ` · ${r.description ? `${r.description_par} : ${r.description}` : "SANS DESCRIPTION"}`),
    );
  } catch (e) {
    refusees += 1;
    console.log(`${court} : ÉCHEC ${e instanceof Error ? e.message : e}`);
  }
}
// Quelques images à la fois, chacune prise dans la file par le premier libre.
const file = lignes.map((ligne, rang) => ({ ligne, rang }));
await Promise.all(
  Array.from({ length: Math.min(parallele, file.length) }, async () => {
    for (let suivante = file.shift(); suivante; suivante = file.shift()) await traiter(suivante.ligne, suivante.rang);
  }),
);
apercus.sort((a, b) => a.rang - b.rang);

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
if (essai && apercus.length) {
  // Une planche des images telles qu'elles seront versées, assez grande pour voir un texte ou un collage.
  const [L, H, BANDE, COLONNES] = [330, 587, 22, 6];
  const rangs = Math.ceil(apercus.length / COLONNES);
  const c = createCanvas(COLONNES * (L + 4) - 4, rangs * (H + BANDE + 4) - 4);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = "15px sans-serif";
  ctx.textBaseline = "middle";
  for (const [i, a] of apercus.entries()) {
    const x = (i % COLONNES) * (L + 4);
    const y = Math.floor(i / COLONNES) * (H + BANDE + 4);
    ctx.drawImage(await loadImage(a.jpeg), x, y, L, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y + H, L, BANDE);
    ctx.fillStyle = "#ffd84d";
    ctx.fillText(`${a.court}${a.note}`, x + 5, y + H + BANDE / 2);
  }
  writeFileSync(`${dossierEssai}/apercu.jpg`, await c.encode("jpeg", 86));
}
console.log(
  essai
    ? `Essai : ${apercus.length} image(s) recadrée(s), rien de versé. À regarder : ${dossierEssai}/apercu.jpg`
    : `${versees} versée(s), ${deja} déjà en banque, ${refusees} refusée(s)${planche ? (refusees ? ` · planche ${planche} laissée ouverte (corrige et relance)` : `, ${ecartees} écartée(s) : planche ${planche} réglée`) : ""}${quota ? " · quota du jour atteint" : ""}${sansDescription ? ` · ${sansDescription} sans description (l'OS n'en a rendu aucune : donne une legende et reverse)` : ""}`,
);
if (refusees) process.exitCode = 1;
