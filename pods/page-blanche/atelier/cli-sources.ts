// Usage :
//   node atelier/cli-sources.ts                 télécharge les slides des posts du manifeste
//   node atelier/cli-sources.ts <post_id> …     seulement ces posts
//   node atelier/cli-sources.ts --compte <handle> [--max 30]
//                                               scrape un compte, ajoute ses nouveaux posts
//                                               slideshows au manifeste (statut « nouveau »)
//
// Les slides vont dans sources/<post_id>_<n>.jpg (hors git). Re-télécharger un
// même post redonne exactement les mêmes octets : géométrie et traductions
// restent valables d'une session à l'autre.
// Apify : jeton injecté par le proxy de la session (ou APIFY_TOKEN).

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ACTEUR = "https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items";
const DOSSIER = "sources";
const MANIFESTE = "posts/manifeste.json";

type PostManifeste = {
  post_id: string;
  url: string;
  publie_le?: string;
  vues: number | null;
  likes?: number;
  partages?: number;
  enregistrements?: number;
  slides: number;
  legende: string;
  musique: { titre: string | null; auteur?: string | null; original?: boolean; id?: string | null; url_tiktok: string | null };
  statut: string;
  raison_exclusion?: string | null;
  /** Post original : slide n → slide source réutilisée (« <post_id>_<n> »). */
  composition?: Record<string, string>;
};
type Manifeste = { compte: string; scrape_le: string; posts: PostManifeste[] };

type PostApify = {
  id: string;
  webVideoUrl?: string;
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  shareCount?: number;
  collectCount?: number;
  text?: string;
  isSlideshow?: boolean;
  slideshowImageLinks?: { downloadLink?: string; tiktokLink?: string }[];
  musicMeta?: { musicName?: string; musicAuthor?: string; musicOriginal?: boolean; musicId?: string };
};

async function apify(entree: Record<string, unknown>): Promise<PostApify[]> {
  const jeton = process.env.APIFY_TOKEN ? `?token=${process.env.APIFY_TOKEN}` : "";
  const r = await fetch(ACTEUR + jeton, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shouldDownloadSlideshowImages: true, shouldDownloadVideos: false, shouldDownloadCovers: false, ...entree }),
  });
  const corps = await r.json();
  if (!Array.isArray(corps)) throw new Error(`Apify : ${JSON.stringify(corps).slice(0, 300)}`);
  return corps as PostApify[];
}

async function telecharger(p: PostApify): Promise<number> {
  mkdirSync(DOSSIER, { recursive: true });
  let n = 0;
  for (const [i, im] of (p.slideshowImageLinks ?? []).entries()) {
    const chemin = join(DOSSIER, `${p.id}_${i + 1}.jpg`);
    if (existsSync(chemin)) continue;
    const url = im.downloadLink ?? im.tiktokLink;
    if (!url) continue;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${p.id} slide ${i + 1} : HTTP ${r.status}`);
    writeFileSync(chemin, Buffer.from(await r.arrayBuffer()));
    n++;
  }
  return n;
}

const versManifeste = (p: PostApify): PostManifeste => ({
  post_id: p.id,
  url: p.webVideoUrl ?? "",
  publie_le: p.createTimeISO?.slice(0, 10),
  vues: p.playCount ?? 0,
  likes: p.diggCount,
  partages: p.shareCount,
  enregistrements: p.collectCount,
  slides: p.slideshowImageLinks?.length ?? 0,
  legende: (p.text ?? "").trim(),
  musique: {
    titre: p.musicMeta?.musicName ?? null,
    auteur: p.musicMeta?.musicAuthor ?? null,
    original: p.musicMeta?.musicOriginal,
    id: p.musicMeta?.musicId ?? null,
    url_tiktok: p.musicMeta?.musicId ? `https://www.tiktok.com/music/x-${p.musicMeta.musicId}` : null,
  },
  statut: "nouveau",
});

const args = process.argv.slice(2);
const manifeste = JSON.parse(readFileSync(MANIFESTE, "utf8")) as Manifeste;
const i = args.indexOf("--compte");

if (i >= 0) {
  const handle = args[i + 1].replace(/^@/, "");
  const max = Number(args[args.indexOf("--max") + 1]) || 30;
  const posts = (await apify({ profiles: [handle], resultsPerPage: max })).filter((p) => p.slideshowImageLinks?.length);
  const connus = new Set(manifeste.posts.map((p) => p.post_id));
  let nouveaux = 0;
  for (const p of posts) {
    const deja = manifeste.posts.find((m) => m.post_id === p.id);
    if (deja) {
      deja.vues = p.playCount ?? deja.vues; // vues à jour
      continue;
    }
    if (connus.has(p.id)) continue;
    manifeste.posts.push(versManifeste(p));
    await telecharger(p);
    nouveaux++;
  }
  manifeste.scrape_le = new Date().toISOString().slice(0, 10);
  writeFileSync(MANIFESTE, JSON.stringify(manifeste, null, 1));
  console.log(`@${handle} : ${posts.length} slideshows, ${nouveaux} nouveau(x) ajouté(s) au manifeste`);
} else {
  const cibles = args.length ? args : manifeste.posts.filter((p) => p.statut !== "exclu").map((p) => p.post_id);
  const originaux = manifeste.posts.filter((p) => p.composition && cibles.includes(p.post_id));
  // Les slides réutilisées par un post original viennent de leur post d'origine.
  for (const o of originaux) for (const src of Object.values(o.composition!)) {
    const id = src.replace(/_\d+$/, "");
    if (!cibles.includes(id)) cibles.push(id);
  }
  const manquants = cibles.filter((id) => {
    const p = manifeste.posts.find((m) => m.post_id === id);
    return p && !p.composition && !existsSync(join(DOSSIER, `${id}_${p.slides}.jpg`));
  });
  if (!manquants.length) {
    console.log(`${cibles.length} post(s) : sources déjà là`);
  } else {
    const urls = manquants.map((id) => manifeste.posts.find((m) => m.post_id === id)!.url);
    const posts = await apify({ postURLs: urls });
    let n = 0;
    for (const p of posts) n += await telecharger(p);
    console.log(`${manquants.length} post(s) récupéré(s), ${n} slide(s) téléchargée(s)`);
  }
  for (const o of originaux) {
    for (const [num, src] of Object.entries(o.composition!)) {
      copyFileSync(join(DOSSIER, `${src}.jpg`), join(DOSSIER, `${o.post_id}_${num}.jpg`));
    }
    console.log(`${o.post_id} (original) : ${Object.keys(o.composition!).length} slide(s) assemblée(s)`);
  }
}
