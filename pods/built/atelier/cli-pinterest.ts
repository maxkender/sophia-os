// Photos Pinterest pour la banque de l'OS (demande d'Adrien du 25/11 : la banque
// male_run n'avait plus de coureur neuf). Trois temps, l'œil entre chaque :
//
//   npm run pinterest -- collecter "man running aesthetic" "man trail running" … [--limite 30]
//       Apify (thescrappa/pinterest-search-scraper, 0,000375 $ la pin) : garde
//       les photos de 720 px de large au moins, sans vidéo, absentes des
//       collectes précédentes, dans donnees/pinterest.json, et écrit la planche
//       numérotée sortie/pinterest/<date>.jpg.
//   npm run pinterest -- voir 12 [13 14…]
//       Télécharge l'original dans sortie/pinterest/<n>.jpg : regarde-le en
//       grand (outil Read) avant de le verser. Pas de marque visible, pas de
//       texte ni de filigrane, pas de personne connue, une photo nette.
//   npm run pinterest -- verser 12 "a man running alone on a foggy mountain road" [--label male-run]
//       Réencode en JPEG sans métadonnées (largeur 1440 au plus) et l'envoie à
//       l'action `ajouter_photo` de l'OS (source « pinterest », URL de la pin
//       gardée, doublon refusé). Le label doit être dans la liste blanche du podz.
//
// Environnement : POD_JETON (verser). Budget Apify : 1 $ par semaine glissante
// (donnees/depenses_apify.json), comme la veille.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { appelPod } from "./api.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import { planche } from "./planche.ts";

const API = "https://api.apify.com/v2";
const ACTEUR = "thescrappa~pinterest-search-scraper";
const PRIX_PIN = 0.000375;
const BUDGET_SEMAINE = 1.0;
const JOURNAL = "donnees/depenses_apify.json";
const FICHIER = "donnees/pinterest.json";
const DOSSIER = "sortie/pinterest";
const LARGEUR_MIN = 720;
const LARGEUR_MAX = 1440;

type Candidate = { n: number; url: string; largeur: number; hauteur: number; pin: string; recherche: string; versee?: string };
type Depense = { le: string; mode: string; usd: number; items: number };

const [commande, ...reste] = process.argv.slice(2);
const opt = (n: string) => (reste.includes(n) ? reste[reste.indexOf(n) + 1] : undefined);
const libres = reste.filter((a, i) => !a.startsWith("--") && !(i > 0 && reste[i - 1].startsWith("--")));
mkdirSync("donnees", { recursive: true });
mkdirSync(DOSSIER, { recursive: true });
const candidates: Candidate[] = existsSync(FICHIER) ? JSON.parse(readFileSync(FICHIER, "utf8")) : [];
const sauver = () => writeFileSync(FICHIER, JSON.stringify(candidates, null, 1));

async function telecharger(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function appel<T>(url: string, corps?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corps === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

if (commande === "collecter") {
  if (!libres.length) throw new Error('usage : pinterest collecter "man running aesthetic" … [--limite 30]');
  const limite = Number(opt("--limite") ?? 30);
  const journal: Depense[] = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, "utf8")) : [];
  const semaine = journal.filter((d) => Date.now() - Date.parse(d.le) < 7 * 86_400_000).reduce((s, d) => s + d.usd, 0);
  const prevu = libres.length * limite * PRIX_PIN;
  if (semaine + prevu > BUDGET_SEMAINE && !reste.includes("--hors-budget")) {
    throw new Error(`budget Apify : ${semaine.toFixed(2)} $ dépensés + ${prevu.toFixed(2)} $ prévus > ${BUDGET_SEMAINE} $ : demande l'accord de l'humain, puis --hors-budget`);
  }
  // Run asynchrone : le proxy coupe une requête au bout de ~30 s.
  type Run = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };
  let run = (await appel<{ data: Run }>(`${API}/acts/${ACTEUR}/runs`, { queries: libres, limit: limite })).data;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    await new Promise((ok) => setTimeout(ok, 5000));
    run = (await appel<{ data: Run }>(`${API}/actor-runs/${run.id}`)).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`run Apify ${run.id} : ${run.status}`);
  type Pin = { id?: string; pin_url?: string | null; is_video?: boolean; search_query?: string; query?: string; images?: { orig?: { url: string; width: number; height: number } } };
  const pins = await appel<Pin[]>(`${API}/datasets/${run.defaultDatasetId}/items?clean=true`);
  journal.push({ le: new Date().toISOString(), mode: `pinterest ${libres.join(" | ")}`, usd: run.usageTotalUsd ?? pins.length * PRIX_PIN, items: pins.length });
  writeFileSync(JOURNAL, JSON.stringify(journal, null, 1));
  const connues = new Set(candidates.map((c) => c.url));
  const nouvelles: Candidate[] = [];
  for (const p of pins) {
    const o = p.images?.orig;
    if (!o?.url || p.is_video || (o.width ?? 0) < LARGEUR_MIN || connues.has(o.url)) continue;
    connues.add(o.url);
    nouvelles.push({
      n: (candidates.at(-1)?.n ?? 0) + nouvelles.length + 1,
      url: o.url,
      largeur: o.width,
      hauteur: o.height,
      // L'acteur ne rend pas toujours l'URL de la pin : à défaut, celle de l'image (i.pinimg.com).
      pin: p.pin_url && p.pin_url.startsWith("https://") ? p.pin_url : o.url,
      recherche: p.search_query ?? p.query ?? "",
    });
  }
  candidates.push(...nouvelles);
  sauver();
  const vignettes = nouvelles.map((c) => ({ id: String(c.n), url: c.url.replace("/originals/", "/236x/"), legende: String(c.n) }));
  const sortie = `${DOSSIER}/${new Date().toISOString().slice(0, 10)}.jpg`;
  if (vignettes.length) await planche(vignettes, sortie, 8, 200, "contain");
  console.log(`${pins.length} pins, ${nouvelles.length} nouvelles candidates (n° ${nouvelles[0]?.n ?? "-"} à ${nouvelles.at(-1)?.n ?? "-"}) → ${sortie}`);
} else if (commande === "voir") {
  for (const n of libres.map(Number)) {
    const c = candidates.find((x) => x.n === n);
    if (!c) throw new Error(`${n} : pas dans ${FICHIER}`);
    writeFileSync(`${DOSSIER}/${n}.jpg`, await telecharger(c.url));
    console.log(`${DOSSIER}/${n}.jpg  ${c.largeur}×${c.hauteur}  ${c.pin}${c.versee ? `  (déjà versée : ${c.versee})` : ""}`);
  }
} else if (commande === "verser") {
  const [n, legende] = [Number(libres[0]), libres[1]];
  const label = opt("--label") ?? "male-run";
  const c = candidates.find((x) => x.n === n);
  if (!c || !legende) throw new Error('usage : pinterest verser <n> "<description en anglais>" [--label male-run]');
  if (c.versee) throw new Error(`${n} : déjà versée (${c.versee})`);
  const image = await loadImage(await telecharger(c.url));
  const k = Math.min(1, LARGEUR_MAX / image.width);
  const canvas = createCanvas(Math.round(image.width * k), Math.round(image.height * k));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpeg = retirerMetadonnees(await canvas.encode("jpeg", 90));
  const r = await appelPod<{ id: string; url: string }>({ action: "ajouter_photo", label, jpeg_base64: jpeg.toString("base64"), legende, origine_url: c.pin });
  if (!r.ok) throw new Error(`${n} : REFUSÉE ${r.error}`);
  c.versee = r.id;
  sauver();
  console.log(`${n} : dans la banque ${label} (${r.id.slice(0, 8)}) ${r.url}`);
} else {
  throw new Error("usage : pinterest collecter … | voir <n> … | verser <n> \"<légende>\" [--label male-run]");
}
