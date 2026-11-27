// Usage :
//   npm run objet -- --chercher "<mots anglais>" [--limite 20]   des objets du Met (domaine public, avec image)
//   npm run objet -- <id Met> <nom> [--tolerance 34] [--pas 12] [--garder-fond]
//
// Les objets des loisirs de l'iceberg (un pion d'échecs, un violon, un globe
// céleste, une tablette cunéiforme, un casque…) sont de VRAIS objets du
// domaine public, pris au Metropolitan Museum of Art (Open Access, CC0 :
// https://metmuseum.github.io), DÉTOURÉS SANS IA : le Met les photographie
// sur un fond uni ou en dégradé (blanc, gris, noir, un sol en fondu) ; on
// remplit ce fond depuis les bords de l'image, de proche en proche : un pixel
// le rejoint s'il diffère peu de son voisin déjà pris (`--pas`, le dégradé
// passe, le bord net de l'objet arrête) et reste assez près de la couleur du
// fond (`--tolerance`, ×4 pour le dégradé) ; on le rend transparent, on
// adoucit le contour d'un pixel et on rogne au plus juste. `--garder-fond` garde l'image entière
// (une peinture, un dessin, un parchemin : comme sa Joconde, posée telle
// quelle).
// Sort images/objets/<nom>.png et l'aperçu sortie/objets/<nom>.jpg (sur un
// damier et sur le bleu de l'iceberg) À REGARDER avec Read : un reste de fond
// (un halo, une ombre portée) → baisse ou monte `--tolerance` ; un objet
// mangé → baisse-la ; un fond trop chargé → un autre objet. La fiche va dans
// donnees/oeuvres.json : recopie-la dans `oeuvres` du post.
// Jamais un objet sacré ou funéraire montré comme un jouet (une momie, un
// reliquaire), jamais une arme tournée vers quelqu'un, jamais de nu.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  primaryImageSmall: string;
  classification: string;
  department: string;
  objectURL: string;
};

async function objet(id: number | string): Promise<Objet> {
  const r = await fetch(`${API}/v1/objects/${id}`);
  if (!r.ok) throw new Error(`Met ${id} : HTTP ${r.status}`);
  return (await r.json()) as Objet;
}

if (args.includes("--chercher")) {
  const mots = opt("--chercher");
  if (!mots) throw new Error('usage : objet --chercher "<mots>"');
  const limite = Number(opt("--limite") ?? 20);
  const r = await fetch(`${API}/v1.1/search?hasImages=true&q=${encodeURIComponent(mots)}&limit=${Math.min(limite * 3, 120)}`);
  if (!r.ok) throw new Error(`Met : HTTP ${r.status}`);
  const ids = ((await r.json()) as { objectIDs?: number[] }).objectIDs ?? [];
  let n = 0;
  for (const id of ids) {
    if (n >= limite) break;
    const o = await objet(id).catch(() => null);
    if (!o || !o.isPublicDomain || !o.primaryImage) continue;
    console.log(`${o.objectID} · ${o.title} · ${o.classification || o.department} · ${o.objectDate} · ${o.primaryImageSmall}`);
    n++;
  }
  if (!n) console.log("aucun objet du domaine public avec image : essaie d'autres mots anglais (chess piece, violin, celestial globe, helmet, cuneiform…)");
} else {
  const [id, nom] = args;
  if (!id || !nom || !/^\d+$/.test(id) || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : objet <id Met> <nom-en-minuscules> [--tolerance 34] [--garder-fond]");
  const tolerance = Number(opt("--tolerance") ?? 34);
  const pasMax = Number(opt("--pas") ?? 12);
  const o = await objet(id);
  if (!o.isPublicDomain) throw new Error(`${o.title} : pas dans le domaine public au Met, refusé`);
  if (!o.primaryImage) throw new Error(`${o.title} : pas d'image au Met`);
  const r = await fetch(o.primaryImage);
  if (!r.ok) throw new Error(`${o.primaryImage} : HTTP ${r.status}`);
  const img = await loadImage(Buffer.from(await r.arrayBuffer()));
  const k = Math.min(1, 700 / Math.max(img.width, img.height));
  const W = Math.round(img.width * k);
  const H = Math.round(img.height * k);
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H);
  const px = d.data;
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  if (!args.includes("--garder-fond")) {
    // La couleur du fond : la médiane des pixels du bord.
    const bord: number[][] = [];
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) bord.push([px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]]);
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) bord.push([px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]]);
    const fond = [0, 1, 2].map((q) => bord.map((v) => v[q]).sort((a, b) => a - b)[bord.length >> 1]);
    const ecart = (i: number, j: number) => Math.abs(px[i] - px[j]) + Math.abs(px[i + 1] - px[j + 1]) + Math.abs(px[i + 2] - px[j + 2]);
    const auFond = (i: number) => Math.abs(px[i] - fond[0]) + Math.abs(px[i + 1] - fond[1]) + Math.abs(px[i + 2] - fond[2]);
    // Remplissage de proche en proche depuis les bords (4-connexité) : on part des pixels du bord
    // proches du fond, et on passe à un voisin s'il diffère peu (le dégradé) sans trop s'éloigner du fond.
    const vu = new Uint8Array(W * H);
    const pile: number[] = [];
    const graine = (p: number) => {
      if (!vu[p] && auFond(p * 4) <= tolerance * 3) (vu[p] = 1), pile.push(p);
    };
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) graine(y * W + x);
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) graine(y * W + x);
    while (pile.length) {
      const p = pile.pop()!;
      const x = p % W, y = (p / W) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q < 0 || vu[q]) continue;
        if (ecart(p * 4, q * 4) <= pasMax && auFond(q * 4) <= tolerance * 12) (vu[q] = 1), pile.push(q);
      }
    }
    // Transparence, adoucie d'un pixel au contour.
    for (let p = 0; p < W * H; p++) if (vu[p]) px[p * 4 + 3] = 0;
    const alpha = new Uint8ClampedArray(W * H);
    for (let p = 0; p < W * H; p++) alpha[p] = px[p * 4 + 3];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (!alpha[p]) continue;
        const v = (alpha[p - 1] + alpha[p + 1] + alpha[p - W] + alpha[p + W] + alpha[p]) / 5;
        px[p * 4 + 3] = v;
      }
    ctx.putImageData(d, 0, 0);
    // Rogner au plus juste, sans les fils isolés (une colonne ou une rangée où l'objet tient moins de 2 %).
    const col = new Array(W).fill(0), lig = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 20) (col[x]++, lig[y]++);
    const seuilC = H * 0.02, seuilL = W * 0.02;
    x0 = col.findIndex((v) => v > seuilC); x1 = W - 1 - [...col].reverse().findIndex((v) => v > seuilC);
    y0 = lig.findIndex((v) => v > seuilL); y1 = H - 1 - [...lig].reverse().findIndex((v) => v > seuilL);
    if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) throw new Error(`${o.title} : tout le fond est parti, l'objet aussi (baisse --tolerance)`);
    x1 += 1; y1 += 1;
    const part = vu.reduce((s, v) => s + v, 0) / (W * H);
    console.log(`fond ${fond.join(",")} retiré sur ${(part * 100).toFixed(0)} % de l'image`);
    if (part < 0.15) console.warn("  moins de 15 % de fond retiré : le fond n'est sans doute pas uni (regarde l'aperçu, ou --garder-fond)");
  }
  // Gardé à 380 px au plus de côté : l'iceberg l'affiche à 210 × 160 px au plus.
  const r2 = Math.min(1, 380 / Math.max(x1 - x0, y1 - y0));
  const sortie = createCanvas(Math.round((x1 - x0) * r2), Math.round((y1 - y0) * r2));
  sortie.getContext("2d").drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, sortie.width, sortie.height);
  mkdirSync(join(racine, "images", "objets"), { recursive: true });
  const f = join("images", "objets", `${nom}.png`);
  writeFileSync(join(racine, f), sortie.toBuffer("image/png"));
  // L'aperçu : sur un damier, puis sur le bleu de l'iceberg.
  const ap = createCanvas(2 * 340 + 10, 340);
  const a = ap.getContext("2d");
  for (let y = 0; y < 340; y += 20) for (let x = 0; x < 340; x += 20) (a.fillStyle = (x + y) % 40 ? "#cccccc" : "#ffffff"), a.fillRect(x, y, 20, 20);
  a.fillStyle = "#7fb6d6";
  a.fillRect(350, 0, 340, 340);
  const kk = Math.min(320 / sortie.width, 320 / sortie.height);
  for (const ox of [10, 360]) a.drawImage(sortie, ox, 10, sortie.width * kk, sortie.height * kk);
  mkdirSync(join(racine, "sortie", "objets"), { recursive: true });
  writeFileSync(join(racine, "sortie", "objets", `${nom}.jpg`), ap.toBuffer("image/jpeg", 88));
  mkdirSync(join(racine, "donnees"), { recursive: true });
  const fichier = join(racine, "donnees", "oeuvres.json");
  const fiches = existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf8")) as Record<string, unknown>) : {};
  const fiche = { musee: "The Met", id: String(o.objectID), titre: o.title, artiste: o.artistDisplayName, date: o.objectDate, url: o.objectURL };
  fiches[f] = fiche;
  writeFileSync(fichier, JSON.stringify(fiches, null, 1));
  console.log(`${f} ← ${o.title} · ${o.objectDate} (${sortie.width} × ${sortie.height}) · aperçu sortie/objets/${nom}.jpg`);
  console.log(`"${f}": ${JSON.stringify(fiche)}`);
}
