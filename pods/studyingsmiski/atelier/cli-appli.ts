// Usage :
//   npm run appli -- "habit tracker" [--n 10]
//   npm run appli -- --id <id App Store> <nom>
//
// Les VRAIES applis de ses listes (à côté de Sophia), lues sur l'App Store
// (API de recherche d'iTunes, sans clé) :
// - la recherche liste les applis (id, note, nombre d'avis, catégorie,
//   éditeur) et en fait une planche (icône et trois premières captures),
//   sortie/applis/<recherche>.jpg, à REGARDER avec Read ;
// - `--id` télécharge l'icône en 1024 px dans images/applis/<nom>/icone.jpg
//   avec fiche.json (nom, éditeur, catégorie, note, description de l'App
//   Store) : c'est là qu'on lit ce que fait l'appli avant d'écrire sa phrase.
// Jamais une appli concurrente de Sophia (apprentissage, culture générale,
// langues, résumés de livres, temps d'écran et blocage : Duolingo, Headway,
// Opal, Forest, Flora…), ni Turbo AI et les applis de révision par l'IA :
// `npm run livrer` en refuse une partie, à toi de voir le reste. Les notes,
// sons, habitudes et agendas restent.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

type Appli = {
  trackId: number;
  trackName: string;
  sellerName: string;
  primaryGenreName: string;
  averageUserRating?: number;
  userRatingCount?: number;
  artworkUrl512: string;
  screenshotUrls: string[];
  description: string;
  trackViewUrl: string;
};

async function octets(u: string): Promise<Buffer> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${u.slice(0, 80)}`);
  return Buffer.from(await r.arrayBuffer());
}

const id = opt("--id");
if (id) {
  const nom = args[args.indexOf("--id") + 2];
  if (!nom || !/^[a-z0-9-]{2,40}$/.test(nom)) throw new Error("usage : appli --id <id> <nom-en-minuscules>");
  const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=us`);
  const a = ((await r.json()) as { results: Appli[] }).results[0];
  if (!a) throw new Error(`${id} : introuvable sur l'App Store (us)`);
  const dossier = join(racine, "images", "applis", nom);
  mkdirSync(dossier, { recursive: true });
  // L'icône en 1024 px (le CDN d'Apple sert la taille demandée) : elle est affichée en 408 px.
  const img = await loadImage(await octets(a.artworkUrl512.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/1024x1024bb.jpg")));
  const c = createCanvas(img.width, img.height);
  c.getContext("2d").drawImage(img, 0, 0);
  writeFileSync(join(dossier, "icone.jpg"), retirerMetadonnees(c.toBuffer("image/jpeg", 92)));
  const fiche = { id: a.trackId, nom: a.trackName, editeur: a.sellerName, categorie: a.primaryGenreName, note: a.averageUserRating, avis: a.userRatingCount, url: a.trackViewUrl, description: a.description };
  writeFileSync(join(dossier, "fiche.json"), `${JSON.stringify(fiche, null, 1)}\n`);
  console.log(`images/applis/${nom}/ : ${a.trackName} (${a.sellerName}, ${a.primaryGenreName}, ${a.averageUserRating?.toFixed(1) ?? "?"} ★ sur ${a.userRatingCount ?? 0} avis)`);
  console.log(a.description.slice(0, 600));
} else {
  const requete = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--n")).join(" ");
  if (!requete) throw new Error('usage : appli "<recherche en anglais>" [--n 10] | --id <id> <nom>');
  const n = Number(opt("--n") ?? 10);
  const r = await fetch(`https://itunes.apple.com/search?entity=software&country=us&limit=${n}&term=${encodeURIComponent(requete)}`);
  const applis = ((await r.json()) as { results: Appli[] }).results;
  const lv = 520;
  const hv = 330;
  const planche = createCanvas(lv * 2, Math.ceil(applis.length / 2) * (hv + 36));
  const g = planche.getContext("2d");
  g.fillStyle = "#1a1a1a";
  g.fillRect(0, 0, planche.width, planche.height);
  for (const [i, a] of applis.entries()) {
    console.log(`${String(a.trackId).padStart(11)} | ${(a.averageUserRating ?? 0).toFixed(1)} ★ ${String(a.userRatingCount ?? 0).padStart(7)} | ${a.primaryGenreName.slice(0, 16).padEnd(16)} | ${a.sellerName.slice(0, 24).padEnd(24)} | ${a.trackName.slice(0, 50)}`);
    const x = (i % 2) * lv;
    const y = Math.floor(i / 2) * (hv + 36);
    try {
      const ic = await loadImage(await octets(a.artworkUrl512.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/120x120bb.jpg")));
      g.drawImage(ic, x + 8, y + 8, 90, 90);
      for (const [k, u] of a.screenshotUrls.slice(0, 3).entries()) {
        const s = await loadImage(await octets(u.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/200x0w.jpg")));
        const kk = Math.min(130 / s.width, (hv - 10) / s.height);
        g.drawImage(s, x + 110 + k * 136, y + 5, s.width * kk, s.height * kk);
      }
    } catch {
      // images indisponibles
    }
    g.fillStyle = "#ffd76a";
    g.font = "18px sans-serif";
    g.fillText(`${a.trackId} · ${a.trackName.slice(0, 38)}`, x + 8, y + hv + 26);
  }
  mkdirSync(join(racine, "sortie", "applis"), { recursive: true });
  const f = join("sortie", "applis", `${requete.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}.jpg`);
  writeFileSync(join(racine, f), planche.toBuffer("image/jpeg", 85));
  console.log(`planche : ${f}`);
}
