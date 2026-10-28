// Usage : node atelier/verifier-unicite.mjs wa-o073 wa-o074 …
// Refuse un original dont le titre (slide 1) existe déjà mot pour mot chez nous,
// ou dont l'image de couverture ressemble à une couverture déjà utilisée
// (empreinte visuelle de donnees/hash_accroches.json, à jour via hash-accroches.mjs).
import fs from "node:fs";
const H = JSON.parse(fs.readFileSync("donnees/hash_accroches.json"));
const tous = fs.readdirSync("originaux").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync("originaux/" + f)));
const norme = (t) => t.toLowerCase().replace(/\s+/g, " ").trim();
const ham = (a, b) => { let n = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++; return n; };
let ko = 0;
for (const id of process.argv.slice(2)) {
  const o = tous.find((x) => x.source_id === id);
  if (!o) { console.log(id, "introuvable"); ko++; continue; }
  const autres = tous.filter((x) => x.source_id !== id);
  const titre = norme(o.slides[0].texte_overlay);
  const meme = autres.filter((x) => norme(x.slides[0].texte_overlay) === titre).map((x) => x.source_id);
  if (meme.length) { console.log(id, "TITRE DÉJÀ PRIS par", meme.join(",")); ko++; }
  const h = H[o.slides[0].media_id];
  if (!h) { console.log(id, "couverture sans empreinte : relance hash-accroches.mjs"); ko++; continue; }
  const proches = autres.filter((x) => H[x.slides[0].media_id] && ham(H[x.slides[0].media_id], h) <= 10).map((x) => x.source_id);
  if (proches.length) { console.log(id, "COUVERTURE DÉJÀ VUE dans", proches.join(",")); ko++; }
}
console.log(ko ? `${ko} problème(s)` : "ok : titres et couvertures uniques");
process.exit(ko ? 1 : 0);
