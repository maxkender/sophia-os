// Usage : node atelier/cli-preuve.ts <url TikTok…> [--maj]
//
// Lit la page PUBLIQUE d'un post TikTok, sans Apify et sans frais : vues,
// enregistrements, date de publication, légende, nombre de slides, musique.
// Imprime la référence de preuve à coller dans playbook.json (`type: "tiktok"`)
// et dit si elle suffit aujourd'hui (200 k vues ou plus, publiée il y a
// 30 jours au plus).
// --maj : relit toutes les preuves TikTok du playbook et réécrit leurs vues.
//
// Ne découvre rien : un post se vérifie par son lien. Pour trouver de nouveaux
// posts ou comptes, c'est `npm run veille` (Apify).
import { readFileSync, writeFileSync } from "node:fs";
import { aujourdhui, type Playbook, tiktokSuffit } from "./api.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type PostTiktok = {
  url: string;
  auteur: string;
  vues: number;
  enregistrements: number;
  publie_le: string;
  slides: number;
  legende: string;
  musique: { titre: string; url: string } | null;
};

/**
 * Le post tel que la page publique de TikTok le décrit (données de réhydratation).
 * On lit toujours la page `/video/<id>` : celle d'un diaporama (`/photo/<id>`)
 * ne porte pas le post, la page vidéo du même id oui.
 */
async function lirePost(url: string): Promise<PostTiktok> {
  const page = url.replace(/\/photo\/(\d+)/, "/video/$1");
  const r = await fetch(page, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" } });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  const html = await r.text();
  const brut = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!brut) throw new Error(`${url} : page sans données (TikTok a pu demander une vérification, réessaie plus tard)`);
  const detail = JSON.parse(brut)?.__DEFAULT_SCOPE__?.["webapp.video-detail"];
  const it = detail?.itemInfo?.itemStruct;
  if (!it?.id) throw new Error(`${url} : post introuvable (statut ${detail?.statusCode ?? "?"})`);
  const stats = { ...(it.stats ?? {}), ...(it.statsV2 ?? {}) };
  const m = it.music;
  const titre = String(m?.title ?? "").trim();
  return {
    url: `https://www.tiktok.com/@${it.author?.uniqueId}/${it.imagePost ? "photo" : "video"}/${it.id}`,
    auteur: String(it.author?.uniqueId ?? ""),
    vues: Number(stats.playCount ?? 0),
    enregistrements: Number(stats.collectCount ?? 0),
    publie_le: new Date(Number(it.createTime) * 1000).toISOString().slice(0, 10),
    slides: it.imagePost?.images?.length ?? 0,
    legende: String(it.desc ?? ""),
    // L'adresse d'un son se résout par son id ; le titre ne sert qu'à la lire.
    musique: m?.id ? { titre, url: `https://www.tiktok.com/music/${titre.replace(/[\s/?#]+/g, "-").replace(/-+/g, "-") || "son"}-${m.id}` } : null,
  };
}

const args = process.argv.slice(2);
const jour = aujourdhui();

if (args.includes("--maj")) {
  const p = JSON.parse(readFileSync("playbook.json", "utf8")) as Playbook;
  let n = 0;
  for (const s of [...p.schemas, ...p.a_eviter]) {
    for (const ref of s.preuves) {
      if (ref.type !== "tiktok") continue;
      try {
        const post = await lirePost(ref.url);
        ref.vues = post.vues;
        ref.enregistrements = post.enregistrements;
        ref.releve_le = jour;
        n++;
        console.log(`${tiktokSuffit(ref, jour) ? "VALABLE" : "ne suffit plus"} ${post.vues} vues · ${ref.publie_le} · ${ref.url}`);
      } catch (e) {
        console.log(`À VÉRIFIER ${ref.url} : ${(e as Error).message}`);
      }
    }
  }
  writeFileSync("playbook.json", `${JSON.stringify(p, null, 2)}\n`);
  console.log(`\n${n} preuve(s) TikTok relue(s), playbook.json réécrit`);
} else {
  const urls = args.filter((a) => a.startsWith("http"));
  if (!urls.length) throw new Error("usage : preuve <url TikTok…> [--maj]");
  for (const url of urls) {
    const post = await lirePost(url);
    const ref = { type: "tiktok" as const, url: post.url, vues: post.vues, publie_le: post.publie_le, enregistrements: post.enregistrements, releve_le: jour };
    console.log(`@${post.auteur} · ${post.slides} slides · ${post.vues} vues · ${post.enregistrements} enregistrements · ${post.publie_le}`);
    console.log(`  ${post.legende.replace(/\s+/g, " ").slice(0, 140)}`);
    console.log(`  ♪ ${post.musique ? `${post.musique.titre} ${post.musique.url}` : "-"}`);
    console.log(`  ${tiktokSuffit(ref, jour) ? "SUFFIT comme preuve aujourd'hui" : "ne suffit pas (moins de 200 k vues ou plus de 30 jours)"} :`);
    console.log(`  ${JSON.stringify(ref)}\n`);
  }
}
