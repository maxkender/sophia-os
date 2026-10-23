// Usage :
//   node atelier/cli-veille.ts [--comptes a,b] [--posts 60] [--jours 400] [--top 20]
//   node atelier/cli-veille.ts --decouvrir "skills in your 20s" "#lifemaxxing" [--posts 30] [--top 10]
//   (+ --hors-budget, seulement avec l'accord de l'humain)
//
// CE QUI FAIT DES VUES AUJOURD'HUI, relevé en direct sur TikTok (Apify,
// clockworks~tiktok-scraper ; la clé est posée par le proxy de la session).
//
// Relevé (par défaut) : les derniers posts des comptes de veille/comptes.json
// (ou --comptes). Pour chaque compte : posts et vues médianes sur 30 jours.
// Puis les meilleurs diaporamas des --jours derniers jours : vues,
// enregistrements, musique, et une PLANCHE de toutes leurs slides
// (sortie/veille/<date>/…) à LIRE avec Read : c'est là qu'est l'accroche.
// Podz 11 : il publie un post par jour et ses tubes restent bons des mois,
// d'où 60 posts sur 400 jours par défaut. Chaque slide est gardée en taille
// réelle dans donnees/cache/tt_<id du post>_<n>.jpg : c'est là qu'on la mesure.
// Liste enfin les posts qui valent PREUVE (≥ 200 k vues, publiés il y a
// 30 jours au plus), prêts à coller dans playbook.json.
//
// Découverte (--decouvrir) : recherche par mots-clés ou #hashtags, pour
// trouver d'autres comptes de la niche qui font des vues ce mois-ci.
//
// Budget : 1 $ par semaine glissante (journal donnees/depenses_apify.json).
// Au-delà, la commande s'arrête : demande l'accord de l'humain avant --hors-budget.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { aujourdhui, jours, PREUVE_JOURS_MAX, PREUVE_VUES_MIN } from "./api.ts";
import { planche } from "./planche.ts";

const API = "https://api.apify.com/v2";
const BUDGET_SEMAINE = 1.0;
const JOURNAL = "donnees/depenses_apify.json";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const posts = Number(opt("--posts") ?? 60);
const fenetre = Number(opt("--jours") ?? 400);
const top = Number(opt("--top") ?? 20);
const iDec = args.indexOf("--decouvrir");
const requetes = iDec >= 0 ? args.slice(iDec + 1).filter((a, i, t) => !a.startsWith("--") && !(i > 0 && t[i - 1].startsWith("--"))) : [];
const decouverte = iDec >= 0;
if (decouverte && !requetes.length) throw new Error('usage : veille --decouvrir "mots-clés" "#hashtag" …');

type Depense = { le: string; mode: string; usd: number; items: number };
mkdirSync("donnees", { recursive: true });
const journal: Depense[] = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, "utf8")) : [];
const semaine = journal.filter((d) => Date.now() - Date.parse(d.le) < 7 * 86_400_000).reduce((s, d) => s + d.usd, 0);
if (semaine >= BUDGET_SEMAINE && !args.includes("--hors-budget")) {
  throw new Error(`budget Apify de la semaine atteint (${semaine.toFixed(2)} $ sur ${BUDGET_SEMAINE} $) : demande l'accord de l'humain, puis relance avec --hors-budget`);
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

const comptesVeille = (): string[] => {
  const liste = opt("--comptes")?.split(",") ?? (JSON.parse(readFileSync("veille/comptes.json", "utf8")) as { comptes: string[] }).comptes;
  return liste.map((c) => c.trim().replace(/^@/, "")).filter(Boolean);
};
const entree = decouverte
  ? {
      ...(requetes.some((q) => !q.startsWith("#")) ? { searchQueries: requetes.filter((q) => !q.startsWith("#")) } : {}),
      ...(requetes.some((q) => q.startsWith("#")) ? { hashtags: requetes.filter((q) => q.startsWith("#")).map((q) => q.slice(1)) } : {}),
      resultsPerPage: posts,
    }
  : { profiles: comptesVeille(), resultsPerPage: posts };

// Run asynchrone : le proxy coupe une requête au bout de ~30 s.
type Run = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };
let run = (
  await appel<{ data: Run }>(`${API}/acts/clockworks~tiktok-scraper/runs`, {
    ...entree,
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

type Item = {
  id?: string;
  text?: string;
  playCount?: number;
  collectCount?: number;
  shareCount?: number;
  createTimeISO?: string;
  isSlideshow?: boolean;
  webVideoUrl?: string;
  slideshowImageLinks?: { downloadLink?: string; tiktokLink?: string }[];
  authorMeta?: { name?: string; fans?: number };
  musicMeta?: { musicName?: string; musicId?: string };
};
const items = (await appel<Item[]>(`${API}/datasets/${run.defaultDatasetId}/items?clean=true`)).filter((i) => i.id && i.authorMeta?.name);
const usd = Number(run.usageTotalUsd ?? 0);
journal.push({ le: new Date().toISOString(), mode: decouverte ? "decouverte" : "releve", usd, items: items.length });
writeFileSync(JOURNAL, JSON.stringify(journal, null, 1));

const jour = aujourdhui();
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
const posts30 = items.map((i) => {
  const compte = i.authorMeta!.name!;
  const publie_le = (i.createTimeISO ?? "").slice(0, 10);
  const vues = i.playCount ?? 0;
  const enregistrements = i.collectCount ?? 0;
  return {
    compte,
    abonnes: i.authorMeta?.fans ?? null,
    tid: i.id!,
    url: `https://www.tiktok.com/@${compte}/video/${i.id}`,
    publie_le,
    age: publie_le ? jours(publie_le, jour) : 999,
    vues,
    enregistrements,
    partages: i.shareCount ?? 0,
    taux_enreg: vues ? Math.round((1000 * enregistrements) / vues) / 10 : 0,
    diaporama: Boolean(i.isSlideshow),
    slides: (i.slideshowImageLinks ?? []).map((s) => s.downloadLink ?? s.tiktokLink ?? "").filter(Boolean),
    musique: i.musicMeta?.musicName
      ? { titre: i.musicMeta.musicName, url: i.musicMeta.musicId ? `https://www.tiktok.com/music/${slug(i.musicMeta.musicName)}-${i.musicMeta.musicId}` : null }
      : null,
    legende: (i.text ?? "").replace(/\s+/g, " ").slice(0, 140),
  };
});

const mediane = (v: number[]) => {
  const t = [...v].sort((a, b) => a - b);
  return t.length ? (t.length % 2 ? t[(t.length - 1) / 2] : Math.round((t[t.length / 2 - 1] + t[t.length / 2]) / 2)) : 0;
};
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));
const parCompte = new Map<string, typeof posts30>();
for (const p of posts30) parCompte.set(p.compte, [...(parCompte.get(p.compte) ?? []), p]);
const comptes = [...parCompte].map(([compte, l]) => {
  const recents = l.filter((p) => p.age <= 30);
  return {
    compte,
    abonnes: l[0].abonnes,
    posts_releves: l.length,
    posts_30j: recents.length,
    diaporamas_30j: recents.filter((p) => p.diaporama).length,
    mediane_30j: mediane(recents.map((p) => p.vues)),
    max_30j: Math.max(0, ...recents.map((p) => p.vues)),
    dernier_post: l.map((p) => p.publie_le).sort().pop() ?? null,
  };
});
// En découverte, seuls comptent les auteurs qui ont publié un diaporama ce mois-ci.
const comptesUtiles = decouverte ? comptes.filter((c) => c.diaporamas_30j > 0) : comptes;
comptesUtiles.sort((a, b) => (decouverte ? b.max_30j - a.max_30j : b.mediane_30j - a.mediane_30j));

// Les meilleurs diaporamas de la fenêtre, et leurs planches.
const limite = decouverte ? 30 : fenetre;
const meilleurs = posts30.filter((p) => p.diaporama && p.age <= limite && p.slides.length).sort((a, b) => b.vues - a.vues).slice(0, top);
const dossier = `sortie/veille/${jour}${decouverte ? "-decouverte" : ""}`;
const sortiePosts = [];
for (const [rang, p] of meilleurs.entries()) {
  const chemin = `${dossier}/${String(rang + 1).padStart(2, "0")}_${p.compte}_${p.tid}.jpg`;
  try {
    await planche(
      p.slides.map((u, k) => ({ id: `tt_${p.tid}_${k + 1}`, url: u, legende: k === 0 ? `${fmt(p.vues)} vues · ${p.taux_enreg} % enreg.` : `#${k + 1}` })),
      chemin,
      Math.min(p.slides.length, 5),
      340,
      "contain",
    );
  } catch (e) {
    console.error(`planche ${p.tid} : ${e}`);
  }
  sortiePosts.push({ ...p, slides: p.slides.length, planche: chemin, preuve_valable: p.vues >= PREUVE_VUES_MIN && p.age <= PREUVE_JOURS_MAX });
}
const fichier = `donnees/veille/${jour}${decouverte ? "-decouverte" : ""}.json`;
mkdirSync("donnees/veille", { recursive: true });
writeFileSync(
  fichier,
  JSON.stringify({ date: jour, mode: decouverte ? { decouverte: requetes } : { comptes: comptesVeille() }, comptes: comptesUtiles, posts: sortiePosts }, null, 1),
);

console.log(`${items.length} posts relevés · coût ${usd.toFixed(3)} $ · semaine ${(semaine + usd).toFixed(2)} $ / ${BUDGET_SEMAINE} $\n`);
console.log(decouverte ? "Auteurs avec un diaporama ce mois-ci (par meilleur post) :" : "Comptes (30 jours) :");
if (!comptesUtiles.length) console.log("  aucun : essaie d'autres mots-clés ou #hashtags, ou plus de résultats (--posts 50)");
for (const c of comptesUtiles.slice(0, 25)) {
  console.log(
    `  @${c.compte}${c.abonnes ? ` (${fmt(c.abonnes)} abonnés)` : ""} : ${c.posts_30j} posts dont ${c.diaporamas_30j} diaporamas · méd ${fmt(c.mediane_30j)} · max ${fmt(c.max_30j)} · dernier ${c.dernier_post}`,
  );
}
console.log(`\nMeilleurs diaporamas (${limite} derniers jours) — LIS les planches, l'accroche est sur la slide 1 :`);
for (const [i, p] of sortiePosts.entries()) {
  console.log(
    `  ${i + 1}. ${fmt(p.vues)} vues · ${p.taux_enreg} % enreg. · ${p.publie_le} · @${p.compte} · ${p.slides} slides · ♪ ${p.musique?.titre ?? "-"}${p.preuve_valable ? " · PREUVE" : ""}`,
  );
  console.log(`     ${p.url}\n     ${p.planche}`);
}
const preuves = sortiePosts.filter((p) => p.preuve_valable);
if (preuves.length) {
  console.log(`\nPreuves valables (≥ ${fmt(PREUVE_VUES_MIN)} vues, ≤ ${PREUVE_JOURS_MAX} jours), à coller dans playbook.json :`);
  for (const p of preuves) {
    console.log(
      `  ${JSON.stringify({ type: "tiktok", url: p.url, vues: p.vues, enregistrements: p.enregistrements, publie_le: p.publie_le, releve_le: jour })}`,
    );
  }
}
console.log(`\nDétail : ${fichier}`);
