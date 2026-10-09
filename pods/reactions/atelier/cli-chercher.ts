// Usage : node atelier/cli-chercher.ts "<requête>" ["<requête 2>" …] [--n 20]
// Cherche des vidéos TikTok (Apify clockworks~tiktok-scraper, la clé est posée
// par le proxy) et les classe par vues. Écrit donnees/recherche.json.
// Ce qu'on cherche : une RÉACTION courte face caméra (surprise, soulagement…)
// suivie d'une démo d'appli. Les vidéos ne sont pas téléchargées ici.
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const iN = args.indexOf("--n");
const n = iN >= 0 ? Number(args[iN + 1]) : 20;
const requetes = args.filter((_, i) => iN < 0 || (i !== iN && i !== iN + 1));
if (!requetes.length) throw new Error('usage : chercher "<requête>" […] [--n 20]');

const API = "https://api.apify.com/v2";
const run = await fetch(`${API}/acts/clockworks~tiktok-scraper/runs`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ searchQueries: requetes, resultsPerPage: n, searchSection: "/video", shouldDownloadVideos: true, shouldDownloadCovers: true }),
}).then((r) => r.json() as Promise<{ data: { id: string; defaultDatasetId: string } }>);
const id = run.data?.id;
if (!id) throw new Error(`Apify : ${JSON.stringify(run).slice(0, 300)}`);
let statut = "";
for (let i = 0; i < 90 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(statut); i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  statut = ((await fetch(`${API}/actor-runs/${id}`).then((r) => r.json())) as { data: { status: string } }).data.status;
}
if (statut !== "SUCCEEDED") throw new Error(`Apify run ${id} : ${statut}`);

type Item = {
  id: string;
  text: string;
  playCount: number;
  webVideoUrl: string;
  authorMeta?: { name: string };
  videoMeta?: { duration: number; downloadAddr?: string };
  mediaUrls?: string[];
  musicMeta?: { musicName?: string; musicAuthor?: string; musicId?: string };
};
/** La musique de la vidéo : titre lisible et lien de la page son TikTok (le créateur la reprend). */
function musique(m: Item["musicMeta"]): { musique_titre: string | null; musique_url: string | null } {
  if (!m?.musicName) return { musique_titre: null, musique_url: null };
  const titre = m.musicAuthor ? `${m.musicName} – ${m.musicAuthor}` : m.musicName;
  const slug = m.musicName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return { musique_titre: titre, musique_url: m.musicId ? `https://www.tiktok.com/music/${slug}-${m.musicId}` : null };
}
const items = (await fetch(`${API}/datasets/${run.data.defaultDatasetId}/items`).then((r) => r.json())) as Item[];
const vus = new Map<string, Item>();
for (const it of items) if (it.id && !vus.has(it.id)) vus.set(it.id, it);
const tri = [...vus.values()].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
const sortie = tri.map((it) => ({
  id: it.id,
  vues: it.playCount ?? 0,
  duree: it.videoMeta?.duration ?? null,
  auteur: it.authorMeta?.name ?? null,
  url: it.webVideoUrl,
  video: it.mediaUrls?.[0] ?? it.videoMeta?.downloadAddr ?? null,
  texte: (it.text ?? "").slice(0, 200),
  ...musique(it.musicMeta),
}));
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/recherche.json", JSON.stringify(sortie, null, 2));
for (const s of sortie.slice(0, 30)) console.log(`${String(s.vues).padStart(10)} vues · ${s.duree ?? "?"}s · @${s.auteur} · ${s.id} · ${s.texte.replace(/\s+/g, " ").slice(0, 80)}`);
console.log(`${sortie.length} vidéo(s) → donnees/recherche.json`);
