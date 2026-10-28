// Usage : node atelier/verifier-unicite.mjs wa-o073 wa-o074 …
// Un titre (slide 1) mot pour mot ou une couverture déjà utilisée chez nous peut
// revenir, mais pas avant 10 jours après sa dernière livraison, et rarement :
// au plus une reprise par lot. La couverture est comparée par empreinte visuelle
// (donnees/hash_accroches.json, via npm run accroches), pas seulement par media_id.
// La date de livraison d'un original est celle de son premier commit.
import fs from "node:fs";
import { execSync } from "node:child_process";
const JOURS = 10;
const H = JSON.parse(fs.readFileSync("donnees/hash_accroches.json"));
const tous = fs.readdirSync("originaux").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync("originaux/" + f)));
const dates = {};
for (const l of execSync("git log --diff-filter=A --name-only --format=@%cs -- originaux", { encoding: "utf8" }).split("\n")) {
  if (l.startsWith("@")) dates.courante = l.slice(1);
  else if (l.trim()) dates[l.trim().split("/").pop().replace(".json", "")] = dates.courante;
}
const aujourdhui = new Date().toISOString().slice(0, 10);
const age = (id) => (Date.parse(aujourdhui) - Date.parse(dates[id] || aujourdhui)) / 864e5;
const norme = (t) => t.toLowerCase().replace(/\s+/g, " ").trim();
const ham = (a, b) => { let n = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++; return n; };
const lot = process.argv.slice(2);
let ko = 0, reprises = 0;
for (const id of lot) {
  const o = tous.find((x) => x.source_id === id);
  if (!o) { console.log(id, "introuvable"); ko++; continue; }
  const autres = tous.filter((x) => x.source_id !== id && !lot.slice(lot.indexOf(id) + 1).includes(x.source_id));
  const juge = (quoi, liste) => {
    if (!liste.length) return;
    const recent = Math.min(...liste.map(age));
    if (recent < JOURS) { console.log(id, quoi, "déjà livré il y a", recent, "j (minimum", JOURS + ") :", liste.join(",")); ko++; }
    else { console.log(id, quoi, "reprise (dernière il y a", recent, "j) :", liste.join(",")); reprises++; }
  };
  juge("TITRE", autres.filter((x) => norme(x.slides[0].texte_overlay) === norme(o.slides[0].texte_overlay)).map((x) => x.source_id));
  const h = H[o.slides[0].media_id];
  if (!h) { console.log(id, "couverture sans empreinte : relance npm run accroches"); ko++; continue; }
  juge("COUVERTURE", autres.filter((x) => H[x.slides[0].media_id] && ham(H[x.slides[0].media_id], h) <= 10).map((x) => x.source_id));
}
if (reprises > 1) { console.log(reprises, "reprises dans ce lot : au plus 1 (rarement)"); ko++; }
console.log(ko ? `${ko} problème(s)` : "ok");
process.exit(ko ? 1 : 0);
