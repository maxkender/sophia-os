// Usage : node atelier/cli-chercher.ts [--max 60] "men running aesthetic" "trail running sunrise" https://www.pinterest.com/<compte>/<tableau>/
//
// Cherche des images sur Pinterest (scraper Apify) : chaque argument est une
// recherche par mots-clés, ou l'adresse d'un tableau, d'un compte ou d'une
// recherche Pinterest. Un tableau rempli à la main par un humain se lit comme
// une recherche.
//   --max N   épingles demandées par recherche (60 par défaut, 500 au plus)
//
// Les candidates s'ajoutent à donnees/candidats.json (hors git). Sont écartées
// d'office, sans être montrées : les vidéos, les images qui ne sont pas
// verticales, celles trop petites pour un 9:16 de 720 px de large.
// Coût mesuré le 19/11 : 0,0015 $ la recherche (15 épingles), puis 0,0001 $
// l'épingle. La suite : npm run planche.
import { JOURNAL, ecrire, lire, lireStock, scraper, STOCK } from "./api.ts";
import { type Candidat, fusionner, lireEpingle } from "./pinterest.ts";

const args = process.argv.slice(2);
const iMax = args.indexOf("--max");
const max = Math.min(Math.max(Number(iMax >= 0 ? args[iMax + 1] : 60) || 60, 1), 500);
const requetes = args.filter((a, i) => !a.startsWith("--") && (iMax < 0 || i !== iMax + 1)).map((r) => r.trim()).filter(Boolean);
if (!requetes.length) throw new Error('usage : chercher [--max 60] "mots-clés" … | <adresse Pinterest d\'un tableau>');

const stock = lireStock();
const journal = lire<Record<string, unknown>[]>(JOURNAL, []);
const vuLe = new Date().toISOString();
let total = 0;

const resultats = await Promise.allSettled(
  requetes.map(async (requete) => {
    const adresse = /^https:\/\/[a-z.]*pinterest\.[a-z.]+\//i.test(requete);
    if (/^https?:\/\//i.test(requete) && !adresse) throw new Error("une adresse doit être celle d'une page Pinterest");
    const entree = { ...(adresse ? { startUrls: [requete] } : { search: requete }), maxItems: max, getDetails: false };
    return { requete, ...(await scraper(entree)) };
  }),
);

for (const [i, r] of resultats.entries()) {
  if (r.status === "rejected") {
    console.log(`✗ ${requetes[i]} : ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    continue;
  }
  const { requete, items, cout, run } = r.value;
  const candidates: Candidat[] = [];
  const ecartees: Record<string, number> = {};
  for (const item of items) {
    const c = lireEpingle(item, requete, vuLe);
    if (!c) ecartees["illisible"] = (ecartees["illisible"] ?? 0) + 1;
    else if ("ecartee" in c) ecartees[c.ecartee] = (ecartees[c.ecartee] ?? 0) + 1;
    else candidates.push(c);
  }
  const { neuves, revues } = fusionner(stock, candidates);
  total += cout;
  journal.push({ le: vuLe, requete, run, epingles: items.length, candidates: candidates.length, neuves, cout_usd: Number(cout.toFixed(4)) });
  const detail = Object.entries(ecartees).map(([m, n]) => `${n} ${m}`).join(", ");
  console.log(`✓ ${requete} : ${items.length} épingles → ${neuves} candidates neuves, ${revues} déjà vues${detail ? `, écartées d'office : ${detail}` : ""} (${cout.toFixed(4)} $)`);
}

ecrire(STOCK, stock);
ecrire(JOURNAL, journal);
const aTrier = Object.values(stock).filter((c) => !c.decision).length;
console.log(`Stock : ${Object.keys(stock).length} images vues, ${aTrier} à trier · coût de ce passage : ${total.toFixed(4)} $ → npm run planche`);
if (resultats.some((r) => r.status === "rejected")) process.exitCode = 1;
