// Usage :
//   npm run oeuvre -- --chercher "<mots anglais>" [--limite 20]   des œuvres du Met (domaine public, avec image)
//   npm run oeuvre -- <id Met> <nom>                              garde l'œuvre dans images/oeuvres/<nom>.jpg
//
// Les tableaux du podz sont de VRAIES œuvres du domaine public, prises dans le
// Metropolitan Museum of Art (Open Access, CC0 : https://metmuseum.github.io).
// Jamais une œuvre générée, jamais une œuvre encore protégée (un artiste mort
// il y a moins de 70 ans : le Met marque `isPublicDomain` false, l'outil refuse).
// - `--chercher` liste les peintures trouvées (id, titre, artiste, date) : choisis.
// - `<id> <nom>` télécharge l'image originale, la réduit à 1400 px, la réencode
//   sans métadonnées dans images/oeuvres/<nom>.jpg et note sa fiche dans
//   donnees/oeuvres.json : recopie-la dans `oeuvres` du post.
// Regarde ensuite l'image en taille réelle (outil Read) : un cadre, une mire de
// couleurs ou une photo de salle ratée part à la poubelle.

import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const API = "https://collectionapi.metmuseum.org/public/collection";
const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

type Objet = {
  objectID: number;
  title: string;
  artistDisplayName: string;
  objectDate: string;
  isPublicDomain: boolean;
  primaryImage: string;
  classification: string;
  objectURL: string;
  medium: string;
};
/** La boîte de la toile sans ses bords sombres uniformes (≥ 90 % de pixels presque noirs). */
function rognerBordsNoirs(c: Canvas): { x: number; y: number; l: number; h: number } {
  const L = c.width;
  const H = c.height;
  const d = c.getContext("2d").getImageData(0, 0, L, H).data;
  const sombre = (x: number, y: number) => {
    const i = (y * L + x) * 4;
    return Math.max(d[i], d[i + 1], d[i + 2]) < 32;
  };
  const rangee = (y: number) => {
    let n = 0;
    for (let x = 0; x < L; x++) if (sombre(x, y)) n++;
    return n / L >= 0.9;
  };
  const colonne = (x: number, y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (sombre(x, y)) n++;
    return n / Math.max(1, y1 - y0) >= 0.9;
  };
  let haut = 0;
  while (haut < H / 3 && rangee(haut)) haut++;
  let bas = H - 1;
  while (bas > (2 * H) / 3 && rangee(bas)) bas--;
  let gauche = 0;
  while (gauche < L / 3 && colonne(gauche, haut, bas)) gauche++;
  let droite = L - 1;
  while (droite > (2 * L) / 3 && colonne(droite, haut, bas)) droite--;
  const marge = haut || gauche || bas < H - 1 || droite < L - 1 ? 2 : 0;
  const x = Math.min(L - 1, gauche + marge);
  const y = Math.min(H - 1, haut + marge);
  return { x, y, l: Math.max(1, droite - marge - x + 1), h: Math.max(1, bas - marge - y + 1) };
}

async function objet(id: number | string): Promise<Objet> {
  const r = await fetch(`${API}/v1/objects/${id}`);
  if (!r.ok) throw new Error(`Met ${id} : HTTP ${r.status}`);
  return (await r.json()) as Objet;
}

if (args.includes("--chercher")) {
  const mots = opt("--chercher");
  if (!mots) throw new Error('usage : oeuvre --chercher "<mots>"');
  const limite = Number(opt("--limite") ?? 20);
  const r = await fetch(`${API}/v1.1/search?hasImages=true&q=${encodeURIComponent(mots)}&limit=${Math.min(limite * 3, 120)}`);
  if (!r.ok) throw new Error(`Met : HTTP ${r.status}`);
  const ids = ((await r.json()) as { objectIDs?: number[] }).objectIDs ?? [];
  let n = 0;
  for (const id of ids) {
    if (n >= limite) break;
    const o = await objet(id).catch(() => null);
    if (!o || !o.isPublicDomain || !o.primaryImage || !/paint/i.test(o.classification || "")) continue;
    console.log(`${o.objectID} · ${o.title} · ${o.artistDisplayName || "anonyme"} · ${o.objectDate} · ${o.medium}`);
    n++;
  }
  if (!n) console.log("aucune peinture du domaine public avec image : essaie d'autres mots (le titre anglais exact, l'artiste)");
} else {
  const [id, nom] = args;
  if (!id || !nom || !/^\d+$/.test(id) || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : oeuvre <id Met> <nom-en-minuscules>");
  const o = await objet(id);
  if (!o.isPublicDomain) throw new Error(`${o.title} (${o.artistDisplayName}) : pas dans le domaine public au Met, refusé`);
  if (!o.primaryImage) throw new Error(`${o.title} : pas d'image au Met`);
  const r = await fetch(o.primaryImage);
  if (!r.ok) throw new Error(`${o.primaryImage} : HTTP ${r.status}`);
  const img = await loadImage(Buffer.from(await r.arrayBuffer()));
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const brut = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  brut.getContext("2d").drawImage(img, 0, 0, brut.width, brut.height);
  // Le Met photographie souvent la toile sur un fond noir : on retire les bords sombres
  // uniformes (une rangée ou une colonne presque toute noire), plus 2 px de marge.
  const b = rognerBordsNoirs(brut);
  const c = createCanvas(b.l, b.h);
  c.getContext("2d").putImageData(brut.getContext("2d").getImageData(b.x, b.y, b.l, b.h), 0, 0);
  if (b.l < brut.width || b.h < brut.height) console.log(`bords sombres retirés : ${brut.width} × ${brut.height} → ${b.l} × ${b.h}`);
  mkdirSync(join(racine, "images", "oeuvres"), { recursive: true });
  const f = join("images", "oeuvres", `${nom}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  mkdirSync(join(racine, "donnees"), { recursive: true });
  const fichier = join(racine, "donnees", "oeuvres.json");
  const fiches = existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf8")) as Record<string, unknown>) : {};
  const fiche = { musee: "The Met", id: String(o.objectID), titre: o.title, artiste: o.artistDisplayName, date: o.objectDate, url: o.objectURL };
  fiches[f] = fiche;
  writeFileSync(fichier, JSON.stringify(fiches, null, 1));
  console.log(`${f} ← ${o.title} · ${o.artistDisplayName} · ${o.objectDate} (${c.width} × ${c.height})`);
  console.log(`"${f}": ${JSON.stringify(fiche)}`);
}
