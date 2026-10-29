// Usage : node atelier/verifier-unicite.mjs wa-o073 wa-o074 …
// Reprendre un titre (slide 1) ou une couverture est permis : c'est le principe
// des variantes. Seule règle : jamais deux posts identiques. Une reprise doit
// changer quelque chose (items, angle, images ou CTA). Le script signale les
// reprises et refuse un original identique à un autre.
// La couverture est comparée par empreinte visuelle (donnees/hash_accroches.json,
// via npm run accroches), pas seulement par media_id.
import fs from "node:fs";
const H = JSON.parse(fs.readFileSync("donnees/hash_accroches.json"));
const tous = fs.readdirSync("originaux").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync("originaux/" + f)));
const norme = (t) => (t || "").toLowerCase().replace(/\s+/g, " ").trim();
const ham = (a, b) => { let n = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++; return n; };
const empreinte = (o) => JSON.stringify(o.slides.map((s) => [norme(s.texte_overlay), norme(s.texte_sophia), s.media_id]));
let ko = 0;
for (const id of process.argv.slice(2)) {
  const o = tous.find((x) => x.source_id === id);
  if (!o) { console.log(id, "introuvable"); ko++; continue; }
  const autres = tous.filter((x) => x.source_id !== id);
  const identiques = autres.filter((x) => empreinte(x) === empreinte(o)).map((x) => x.source_id);
  if (identiques.length) { console.log(id, "IDENTIQUE à", identiques.join(","), ": change les items, l'angle, les images ou le CTA"); ko++; }
  const titre = autres.filter((x) => norme(x.slides[0].texte_overlay) === norme(o.slides[0].texte_overlay)).map((x) => x.source_id);
  if (titre.length) console.log(id, "reprise du titre de", titre.length, "original(aux)");
  const h = H[o.slides[0].media_id];
  const couv = h ? autres.filter((x) => H[x.slides[0].media_id] && ham(H[x.slides[0].media_id], h) <= 10).map((x) => x.source_id) : [];
  if (couv.length) console.log(id, "reprise de la couverture de", couv.join(","));
}
console.log(ko ? `${ko} problème(s)` : "ok");
process.exit(ko ? 1 : 0);
