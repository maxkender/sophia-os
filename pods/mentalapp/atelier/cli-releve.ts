// Usage : npm run releve [-- --posts 30] [--depuis-fichier <apify.json>] [--hors-budget]
//
// Relève en direct (Apify, clockworks~tiktok-scraper ; la clé est posée par le
// proxy de la session) les posts de @mentalapp depuis le 16/09. Met à jour
// sources/manifeste.json (vues, enregistrements, partages…) et télécharge les
// slides des nouveaux posts dans sources/<id>/<n>.jpg.
//
// --depuis-fichier : relit un jeu de données Apify déjà téléchargé (gratuit).
// Budget : 1 $ par semaine glissante (journal donnees/depenses_apify.json).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { COMPTE_SOURCE, DEPUIS, ecrireManifeste, k, lireManifeste, postsARefaire, VUES_MIN_DEPART, type PostSource } from "./api.ts";

const API = "https://api.apify.com/v2";
const BUDGET_SEMAINE = 1.0;
const JOURNAL = "donnees/depenses_apify.json";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const nbPosts = Number(opt("--posts") ?? 30);
const fichier = opt("--depuis-fichier");

type Item = {
  id?: string;
  text?: string;
  playCount?: number;
  collectCount?: number;
  shareCount?: number;
  commentCount?: number;
  createTimeISO?: string;
  isSlideshow?: boolean;
  webVideoUrl?: string;
  slideshowImageLinks?: { downloadLink?: string; tiktokLink?: string }[];
  musicMeta?: { musicName?: string; musicId?: string };
};

async function appel<T>(url: string, corps?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corps === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function releverApify(): Promise<Item[]> {
  type Depense = { le: string; mode: string; usd: number; items: number };
  mkdirSync("donnees", { recursive: true });
  const journal: Depense[] = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, "utf8")) : [];
  const semaine = journal.filter((d) => Date.now() - Date.parse(d.le) < 7 * 86_400_000).reduce((s, d) => s + d.usd, 0);
  if (semaine >= BUDGET_SEMAINE && !args.includes("--hors-budget")) {
    throw new Error(`budget Apify de la semaine atteint (${semaine.toFixed(2)} $ sur ${BUDGET_SEMAINE} $) : demande l'accord de l'humain, puis relance avec --hors-budget`);
  }
  // Run asynchrone : le proxy coupe une requête au bout de ~30 s.
  type Run = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };
  let run = (
    await appel<{ data: Run }>(`${API}/acts/clockworks~tiktok-scraper/runs`, {
      profiles: [COMPTE_SOURCE],
      resultsPerPage: nbPosts,
      profileScrapeSections: ["videos"],
      profileSorting: "latest",
      oldestPostDateUnified: DEPUIS,
      shouldDownloadSlideshowImages: false,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      proxyCountryCode: "None",
    })
  ).data;
  const debut = Date.now();
  while (["READY", "RUNNING"].includes(run.status)) {
    if (Date.now() - debut > 600_000) throw new Error(`run Apify ${run.id} toujours ${run.status} après 10 min`);
    await new Promise((r) => setTimeout(r, 6000));
    run = (await appel<{ data: Run }>(`${API}/actor-runs/${run.id}`)).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`run Apify ${run.id} : ${run.status}`);
  const items = await appel<Item[]>(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
  const usd = Number(run.usageTotalUsd ?? 0);
  journal.push({ le: new Date().toISOString(), mode: `profil @${COMPTE_SOURCE}`, usd, items: items.length });
  writeFileSync(JOURNAL, JSON.stringify(journal, null, 1));
  console.log(`Apify : ${items.length} posts, ${usd.toFixed(3)} $ (semaine : ${(semaine + usd).toFixed(2)} $ sur ${BUDGET_SEMAINE} $)`);
  return items;
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

/** Enregistre une slide en JPEG (TikTok sert parfois du WebP ou du HEIC converti). */
async function enregistrerSlide(url: string, chemin: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`slide HTTP ${r.status}`);
  const octets = Buffer.from(await r.arrayBuffer());
  if (octets[0] === 0xff && octets[1] === 0xd8) {
    writeFileSync(chemin, octets);
    return;
  }
  const img = await loadImage(octets);
  const c = createCanvas(img.width, img.height);
  c.getContext("2d").drawImage(img, 0, 0);
  writeFileSync(chemin, await c.encode("jpeg", 95));
}

const items: Item[] = fichier ? JSON.parse(readFileSync(fichier, "utf8")) : await releverApify();
const manifeste = lireManifeste();
const maintenant = new Date().toISOString();
let nouveaux = 0;
const erreurs: string[] = [];
for (const i of items) {
  const publie = i.createTimeISO ?? "";
  if (!i.id || !i.isSlideshow || publie.slice(0, 10) < DEPUIS) continue;
  const liens = (i.slideshowImageLinks ?? []).map((l) => l.downloadLink ?? l.tiktokLink ?? "").filter(Boolean);
  const avant = manifeste.posts.find((p) => p.id === i.id);
  const post: PostSource = {
    id: i.id,
    url: i.webVideoUrl ?? `https://www.tiktok.com/@${COMPTE_SOURCE}/photo/${i.id}`,
    publie_le: publie,
    vues: Number(i.playCount ?? 0),
    enregistrements: Number(i.collectCount ?? 0),
    partages: Number(i.shareCount ?? 0),
    commentaires: Number(i.commentCount ?? 0),
    slides: liens.length,
    legende: (i.text ?? "").trim(),
    musique: {
      titre: i.musicMeta?.musicName ?? null,
      url: i.musicMeta?.musicId ? `https://www.tiktok.com/music/${slug(i.musicMeta.musicName ?? "son")}-${i.musicMeta.musicId}` : null,
    },
    statut: avant?.statut ?? (liens.length < 2 ? "exclu" : "a_faire"),
    ...(avant?.motif ? { motif: avant.motif } : liens.length < 2 ? { motif: "une seule slide : l'appli serait sur la couverture" } : {}),
    releve_le: maintenant,
  };
  if (avant) Object.assign(avant, post);
  else {
    manifeste.posts.push(post);
    nouveaux++;
  }
  const dossier = `sources/${i.id}`;
  mkdirSync(dossier, { recursive: true });
  for (const [n, url] of liens.entries()) {
    const chemin = `${dossier}/${n + 1}.jpg`;
    if (existsSync(chemin)) continue;
    await enregistrerSlide(url, chemin).catch((e) => erreurs.push(`${i.id} #${n + 1} : ${(e as Error).message}`));
  }
}
manifeste.maj_le = maintenant;
ecrireManifeste(manifeste);

const aFaire = postsARefaire(manifeste);
const reste = postsARefaire(manifeste, 0).filter((p) => p.vues < VUES_MIN_DEPART);
console.log(`${manifeste.posts.length} posts depuis le ${DEPUIS} (${nouveaux} nouveaux).`);
console.log(`\nÀ refaire d'abord (${VUES_MIN_DEPART / 1000} k vues ou plus, 2 slides ou plus) :`);
for (const p of aFaire) console.log(`  ${p.id} · ${k(p.vues)} · ${p.publie_le.slice(0, 10)} · ${p.slides} slides · ${p.statut}${p.motif ? ` (${p.motif})` : ""}`);
console.log(`\nEnsuite (moins de ${VUES_MIN_DEPART / 1000} k vues) :`);
for (const p of reste) console.log(`  ${p.id} · ${k(p.vues)} · ${p.publie_le.slice(0, 10)} · ${p.slides} slides · ${p.statut}`);
if (erreurs.length) console.log(`\nSlides non téléchargées :\n  ${erreurs.join("\n  ")}`);
