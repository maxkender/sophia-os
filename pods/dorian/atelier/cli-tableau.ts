// Usage :
//   npm run tableau -- "old man playing chess" [--n 12] [--tout]
//   npm run tableau -- --id 41624 <nom>
//
// Ses items montrent souvent un TABLEAU (un vieil homme aux échecs, un
// philosophe, une scène de tribunal). On les prend dans les collections du
// domaine public de l'Art Institute of Chicago (API ouverte, licence CC0) :
// - la recherche liste les œuvres du domaine public (peintures d'abord ;
//   --tout pour les photos, gravures et sculptures) et en fait une planche,
//   sortie/tableaux/<recherche>.jpg, à REGARDER avec Read ;
// - `--id` télécharge l'œuvre choisie dans images/<nom>.jpg (843 px de large,
//   la seule taille que sert l'AIC, sans métadonnées).
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const API = "https://api.artic.edu/api/v1";
const IIIF = "https://www.artic.edu/iiif/2";
const ENTETES = { "AIC-User-Agent": "sophia-os-atelier (pods/dorian)" };
const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

type Oeuvre = { id: number; title: string; artist_title: string | null; image_id: string | null; artwork_type_title: string; date_display: string | null; is_public_domain: boolean };

async function oeuvre(id: string): Promise<Oeuvre> {
  const r = await fetch(`${API}/artworks/${id}?fields=id,title,artist_title,image_id,artwork_type_title,date_display,is_public_domain`, { headers: ENTETES });
  if (!r.ok) throw new Error(`AIC : HTTP ${r.status}`);
  return ((await r.json()) as { data: Oeuvre }).data;
}

const id = opt("--id");
if (id) {
  const nom = args[args.indexOf("--id") + 2];
  if (!nom || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : tableau --id <id> <nom-en-minuscules>");
  const o = await oeuvre(id);
  if (!o.is_public_domain) throw new Error(`${id} : pas dans le domaine public, on ne s'en sert pas`);
  if (!o.image_id) throw new Error(`${id} : pas d'image`);
  // L'IIIF de l'AIC ne sert que la largeur 843 (les autres tailles : 403).
  const r = await fetch(`${IIIF}/${o.image_id}/full/843,/0/default.jpg`, { headers: ENTETES });
  if (!r.ok) throw new Error(`${id} : image HTTP ${r.status}`);
  const brut = Buffer.from(await r.arrayBuffer());
  const img = await loadImage(brut);
  const c = createCanvas(img.width, img.height);
  c.getContext("2d").drawImage(img, 0, 0);
  mkdirSync(join(racine, "images"), { recursive: true });
  const f = join("images", `${nom}.jpg`);
  writeFileSync(join(racine, f), retirerMetadonnees(c.toBuffer("image/jpeg", 90)));
  console.log(`${f} : « ${o.title} », ${o.artist_title ?? "anonyme"}, ${o.date_display ?? ""} (AIC ${o.id}, domaine public)`);
} else {
  const requete = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--n")).join(" ");
  if (!requete) throw new Error('usage : tableau "<recherche en anglais>" [--n 12] [--tout] | --id <id> <nom>');
  const n = Number(opt("--n") ?? 12);
  const tout = args.includes("--tout");
  const r = await fetch(`${API}/artworks/search?q=${encodeURIComponent(requete)}&limit=${tout ? n : n * 4}&fields=id,title,artist_title,image_id,artwork_type_title,date_display,is_public_domain&query[term][is_public_domain]=true`, { headers: ENTETES });
  if (!r.ok) throw new Error(`AIC : HTTP ${r.status}`);
  const oeuvres = ((await r.json()) as { data: Oeuvre[] }).data.filter((o) => o.image_id && (tout || o.artwork_type_title === "Painting")).slice(0, n);
  const col = 4;
  const lv = 300;
  const hv = 380;
  const planche = createCanvas(col * lv, Math.ceil(oeuvres.length / col) * (hv + 40));
  const g = planche.getContext("2d");
  g.fillStyle = "#1a1a1a";
  g.fillRect(0, 0, planche.width, planche.height);
  for (const [i, o] of oeuvres.entries()) {
    console.log(`${String(o.id).padStart(7)} | ${o.artwork_type_title.padEnd(12)} | ${(o.date_display ?? "").slice(0, 14).padEnd(14)} | ${(o.artist_title ?? "anonyme").slice(0, 28).padEnd(28)} | ${o.title.slice(0, 70)}`);
    try {
      const img = await loadImage(Buffer.from(await (await fetch(`${IIIF}/${o.image_id}/full/843,/0/default.jpg`, { headers: ENTETES })).arrayBuffer()));
      const x = (i % col) * lv;
      const y = Math.floor(i / col) * (hv + 40);
      const k = Math.min((lv - 10) / img.width, (hv - 10) / img.height);
      g.drawImage(img, x + (lv - img.width * k) / 2, y + 5, img.width * k, img.height * k);
      g.fillStyle = "#ffd76a";
      g.font = "20px sans-serif";
      g.fillText(String(o.id), x + 8, y + hv + 28);
    } catch {
      // vignette indisponible
    }
  }
  mkdirSync(join(racine, "sortie", "tableaux"), { recursive: true });
  const f = join("sortie", "tableaux", `${requete.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}.jpg`);
  writeFileSync(join(racine, f), planche.toBuffer("image/jpeg", 85));
  console.log(`planche : ${f}`);
}
