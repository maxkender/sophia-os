// Usage :
//   npm run tableau -- --chercher "<mots anglais>" [--limite 15]   tableaux du Met (domaine public, avec image)
//   npm run tableau -- <id Met> <nom>                              télécharge le tableau, sa fiche, sa grille
//   npm run tableau -- <nom> --cadrer "x,y,l x,y,l …" [--entier]   les détails 9:16 à poser dans la banque
//   POD_JETON=… npm run tableau -- <nom> --ajouter                 les ajoute à la banque du label (ids à recopier)
//
// Le podz raconte UN tableau par post, un détail par slide, comme @glacis1.
// Les tableaux viennent du Metropolitan Museum of Art (Open Access, CC0 :
// https://metmuseum.github.io), jamais d'une image générée ni d'un site qui
// n'en a pas les droits.
//
// 1. `<id> <nom>` garde l'image en grand (donnees/tableaux/<nom>.jpg, pas
//    versionnée), sa fiche (donnees/tableaux.json) et une GRILLE à regarder
//    (sortie/tableaux/<nom>-grille.jpg) : des repères tous les 10 % pour
//    situer les détails (x à droite, y en bas, de 0 à 1).
// 2. `--cadrer` : chaque détail est « x,y,l » : son centre (x, y, de 0 à 1) et
//    sa largeur l (part de la largeur du tableau) ; la hauteur suit, au
//    format vertical 9:16. Un détail qui déborde est ramené dans le tableau.
//    `--entier` ajoute le tableau entier sur un fond sombre (la dernière
//    slide : le titre et l'année). Sort sortie/tableaux/<nom>-<n>.jpg
//    (1080 × 1920) et la planche sortie/tableaux/<nom>-details.jpg À
//    REGARDER : un détail flou (moins de 540 px du tableau en largeur) est
//    refusé ; un visage coupé, un cadre doré ou un bord du musée → recadre.
// 3. `--ajouter` envoie chaque détail à la banque du label (`ajouter_image`,
//    40 images par 24 h au plus) avec sa légende en anglais, et écrit leurs
//    ids dans donnees/tableaux.json : recopie-les dans `media_id`.
// Jamais un nu en gros plan, jamais le détail sanglant d'une scène violente.

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod } from "./api.ts";
import { retirerMetadonnees } from "./metadonnees.ts";

const API = "https://collectionapi.metmuseum.org/public/collection";
const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const L = 1080;
const H = 1920;
const LARGEUR_MIN = 540;

type ObjetMet = {
  objectID: number;
  title: string;
  artistDisplayName: string;
  objectDate: string;
  isPublicDomain: boolean;
  primaryImage: string;
  primaryImageSmall: string;
  classification: string;
  objectURL: string;
};
type Fiche = {
  musee: "The Met";
  id: string;
  titre: string;
  artiste: string;
  date: string;
  url: string;
  largeur: number;
  hauteur: number;
  details?: { n: number; cadre: string; fichier: string; media_id?: string }[];
};

const FICHES = join(racine, "donnees", "tableaux.json");
const lireFiches = (): Record<string, Fiche> => (existsSync(FICHES) ? JSON.parse(readFileSync(FICHES, "utf8")) : {});
const ecrireFiches = (f: Record<string, Fiche>) => {
  mkdirSync(join(racine, "donnees"), { recursive: true });
  writeFileSync(FICHES, JSON.stringify(f, null, 1));
};

async function objet(id: number | string): Promise<ObjetMet> {
  const r = await fetch(`${API}/v1/objects/${id}`);
  if (!r.ok) throw new Error(`Met ${id} : HTTP ${r.status}`);
  return (await r.json()) as ObjetMet;
}

/** Le tableau gardé en local (téléchargé une fois). */
async function tableau(nom: string): Promise<Image> {
  const f = join(racine, "donnees", "tableaux", `${nom}.jpg`);
  if (!existsSync(f)) throw new Error(`${nom} : pas encore téléchargé (npm run tableau -- <id Met> ${nom})`);
  return loadImage(readFileSync(f));
}

/** Un détail « x,y,l » en rectangle du tableau, au format 9:16, ramené dans le tableau. */
function cadre(spec: string, W: number, Ht: number) {
  const [x, y, l] = spec.split(",").map(Number);
  if (![x, y, l].every((v) => Number.isFinite(v) && v > 0 && v <= 1)) throw new Error(`détail « ${spec} » : x,y,l entre 0 et 1`);
  let w = l * W;
  let h = (w * H) / L;
  if (h > Ht) (h = Ht), (w = (h * L) / H);
  const sx = Math.min(Math.max(0, x * W - w / 2), W - w);
  const sy = Math.min(Math.max(0, y * Ht - h / 2), Ht - h);
  return { sx, sy, w, h };
}

if (args.includes("--chercher")) {
  const mots = opt("--chercher");
  if (!mots) throw new Error('usage : tableau --chercher "<mots>"');
  const limite = Number(opt("--limite") ?? 15);
  const r = await fetch(`${API}/v1/search?hasImages=true&q=${encodeURIComponent(mots)}`);
  if (!r.ok) throw new Error(`Met : HTTP ${r.status}`);
  const ids = (((await r.json()) as { objectIDs?: number[] }).objectIDs ?? []).slice(0, limite * 4);
  let n = 0;
  for (const id of ids) {
    if (n >= limite) break;
    const o = await objet(id).catch(() => null);
    if (!o || !o.isPublicDomain || !o.primaryImage) continue;
    if (!/painting/i.test(o.classification ?? "")) continue;
    console.log(`${o.objectID} · ${o.title} · ${o.artistDisplayName || "?"} · ${o.objectDate} · ${o.objectURL}`);
    n++;
  }
  if (!n) console.log("aucun tableau du domaine public avec image : d'autres mots anglais (le titre, l'artiste)");
} else if (args.includes("--cadrer") || args.includes("--ajouter")) {
  const nom = args[0];
  if (!nom || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : tableau <nom> --cadrer \"x,y,l …\" [--entier] | <nom> --ajouter");
  const fiches = lireFiches();
  const fiche = fiches[nom];
  if (!fiche) throw new Error(`${nom} : pas de fiche (npm run tableau -- <id Met> ${nom})`);
  if (args.includes("--cadrer")) {
    const img = await tableau(nom);
    const specs = (opt("--cadrer") ?? "").trim().split(/\s+/).filter(Boolean);
    if (args.includes("--entier")) specs.push("entier");
    if (!specs.length) throw new Error('--cadrer "x,y,l x,y,l …"');
    mkdirSync(join(racine, "sortie", "tableaux"), { recursive: true });
    const details: NonNullable<Fiche["details"]> = [];
    const vignettes: Image[] = [];
    for (const [i, spec] of specs.entries()) {
      const c = createCanvas(L, H);
      const ctx = c.getContext("2d");
      if (spec === "entier") {
        // Le tableau entier, centré sur un fond sombre tiré de ses bords.
        const p = createCanvas(8, 8);
        p.getContext("2d").drawImage(img, 0, 0, 8, 8);
        const d = p.getContext("2d").getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < d.length; k += 4) (r += d[k]), (g += d[k + 1]), (b += d[k + 2]);
        const n = d.length / 4;
        ctx.fillStyle = `rgb(${Math.round((r / n) * 0.25)},${Math.round((g / n) * 0.25)},${Math.round((b / n) * 0.25)})`;
        ctx.fillRect(0, 0, L, H);
        const k = Math.min((L - 60) / img.width, (H * 0.8) / img.height);
        const w = img.width * k, h = img.height * k;
        // Plus bas que le centre : la place du titre et de l'année au-dessus.
        ctx.drawImage(img, (L - w) / 2, Math.min(H - h - 40, (H - h) / 2 + 140), w, h);
      } else {
        const { sx, sy, w, h } = cadre(spec, img.width, img.height);
        if (w < LARGEUR_MIN) throw new Error(`détail ${i + 1} « ${spec} » : ${Math.round(w)} px du tableau en largeur, flou une fois agrandi (${LARGEUR_MIN} au moins) : élargis-le`);
        ctx.drawImage(img, sx, sy, w, h, 0, 0, L, H);
      }
      const fichier = join("sortie", "tableaux", `${nom}-${i + 1}.jpg`);
      writeFileSync(join(racine, fichier), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
      details.push({ n: i + 1, cadre: spec, fichier });
      vignettes.push(await loadImage(c.toBuffer("image/jpeg", 70)));
    }
    // La planche : les détails côte à côte, numérotés.
    const v = 240, vh = (v * H) / L, col = Math.min(vignettes.length, 6);
    const pl = createCanvas(col * v, Math.ceil(vignettes.length / col) * (vh + 30));
    const p = pl.getContext("2d");
    p.fillStyle = "#fff";
    p.fillRect(0, 0, pl.width, pl.height);
    p.font = "bold 20px sans-serif";
    vignettes.forEach((im, k) => {
      const x = (k % col) * v, y = Math.floor(k / col) * (vh + 30);
      p.drawImage(im, x, y, v, vh);
      p.fillStyle = "#000";
      p.fillText(`${k + 1} · ${specs[k]}`, x + 6, y + vh + 22);
    });
    writeFileSync(join(racine, "sortie", "tableaux", `${nom}-details.jpg`), pl.toBuffer("image/jpeg", 85));
    fiche.details = details;
    ecrireFiches(fiches);
    console.log(`${details.length} détails → sortie/tableaux/${nom}-details.jpg (à regarder), puis --ajouter`);
  } else {
    if (!fiche.details?.length) throw new Error(`${nom} : aucun détail (--cadrer d'abord)`);
    for (const d of fiche.details) {
      if (d.media_id) {
        console.log(`#${d.n} déjà dans la banque : ${d.media_id}`);
        continue;
      }
      const octets = retirerMetadonnees(readFileSync(join(racine, d.fichier)));
      const quoi = d.cadre === "entier" ? "the whole painting on a dark background" : `detail ${d.n}`;
      const legende = `${fiche.titre} by ${fiche.artiste || "unknown artist"} (${fiche.date}), The Met, public domain: ${quoi}`.slice(0, 300);
      const r = await appelPod<{ id: string }>({ action: "ajouter_image", jpeg_base64: octets.toString("base64"), legende });
      if (!r.ok) throw new Error(`#${d.n} : ${r.error}`);
      d.media_id = r.id;
      ecrireFiches(fiches);
      console.log(`#${d.n} ${d.cadre} → ${r.id}`);
    }
  }
} else {
  const [id, nom] = args;
  if (!id || !nom || !/^\d+$/.test(id) || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : tableau <id Met> <nom-en-minuscules>");
  const o = await objet(id);
  if (!o.isPublicDomain) throw new Error(`${o.title} : pas dans le domaine public au Met, refusé`);
  if (!o.primaryImage) throw new Error(`${o.title} : pas d'image au Met`);
  const r = await fetch(o.primaryImage);
  if (!r.ok) throw new Error(`${o.primaryImage} : HTTP ${r.status}`);
  const octets = Buffer.from(await r.arrayBuffer());
  const brute = await loadImage(octets);
  // Les bords du musée (le fond noir ou gris de la photo, un liseré de cadre) :
  // on rogne les rangées et colonnes du bord tant qu'elles sont unies (écart
  // faible) et sombres ou grises, sans jamais passer 8 % d'un côté.
  const b = createCanvas(brute.width, brute.height);
  const bx = b.getContext("2d");
  bx.drawImage(brute, 0, 0);
  const px = bx.getImageData(0, 0, brute.width, brute.height).data;
  const ligneUnie = (i0: number, pas: number, n: number) => {
    let s = 0, s2 = 0;
    for (let k = 0; k < n; k += 4) {
      const i = (i0 + k * pas) * 4;
      const v = (px[i] + px[i + 1] + px[i + 2]) / 3;
      (s += v), (s2 += v * v);
    }
    const m = s / Math.ceil(n / 4);
    return Math.sqrt(Math.max(0, s2 / Math.ceil(n / 4) - m * m)) < 9 && (m < 60 || Math.abs(m - 128) < 60);
  };
  const W0 = brute.width, H0 = brute.height;
  let x0 = 0, y0 = 0, x1 = W0, y1 = H0;
  while (x0 < W0 * 0.08 && ligneUnie(x0, W0, H0)) x0++;
  while (x1 > W0 * 0.92 && ligneUnie(x1 - 1, W0, H0)) x1--;
  while (y0 < H0 * 0.08 && ligneUnie(y0 * W0, 1, W0)) y0++;
  while (y1 > H0 * 0.92 && ligneUnie((y1 - 1) * W0, 1, W0)) y1--;
  // Quelques pixels de plus : le liseré entre le fond et la toile.
  if (x0) x0 += 6;
  if (y0) y0 += 6;
  if (x1 < W0) x1 -= 6;
  if (y1 < H0) y1 -= 6;
  mkdirSync(join(racine, "donnees", "tableaux"), { recursive: true });
  // Rogné et réencodé sans métadonnées.
  const c = createCanvas(x1 - x0, y1 - y0);
  c.getContext("2d").drawImage(brute, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  writeFileSync(join(racine, "donnees", "tableaux", `${nom}.jpg`), retirerMetadonnees(c.toBuffer("image/jpeg", 92)));
  if (x0 || y0 || x1 < W0 || y1 < H0) console.log(`bords rognés : ${x0} px à gauche, ${W0 - x1} à droite, ${y0} en haut, ${H0 - y1} en bas`);
  const img = await loadImage(c.toBuffer("image/jpeg", 92));
  // La grille : des repères tous les 10 %.
  const k = Math.min(1, 1000 / Math.max(img.width, img.height));
  const g = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  const x = g.getContext("2d");
  x.drawImage(img, 0, 0, g.width, g.height);
  x.strokeStyle = "rgba(255,255,0,0.7)";
  x.fillStyle = "#ff0";
  x.font = "bold 16px sans-serif";
  for (let t = 1; t < 10; t++) {
    x.beginPath();
    x.moveTo((g.width * t) / 10, 0);
    x.lineTo((g.width * t) / 10, g.height);
    x.moveTo(0, (g.height * t) / 10);
    x.lineTo(g.width, (g.height * t) / 10);
    x.stroke();
    x.fillText(`.${t}`, (g.width * t) / 10 + 3, 16);
    x.fillText(`.${t}`, 3, (g.height * t) / 10 - 3);
  }
  mkdirSync(join(racine, "sortie", "tableaux"), { recursive: true });
  writeFileSync(join(racine, "sortie", "tableaux", `${nom}-grille.jpg`), g.toBuffer("image/jpeg", 85));
  const fiches = lireFiches();
  fiches[nom] = { musee: "The Met", id: String(o.objectID), titre: o.title, artiste: o.artistDisplayName, date: o.objectDate, url: o.objectURL, largeur: img.width, hauteur: img.height };
  ecrireFiches(fiches);
  console.log(`${o.title} · ${o.artistDisplayName} · ${o.objectDate} (${img.width} × ${img.height}) → grille sortie/tableaux/${nom}-grille.jpg`);
  console.log(`un détail de largeur l fait ${Math.round(img.width * 0.1)} px du tableau par 0,1 : ${LARGEUR_MIN} px au moins → l ≥ ${(LARGEUR_MIN / img.width).toFixed(2)}`);
}
