// Usage : POD_JETON=… node atelier/cli-boite.ts [--limite 30] [--tout]
//
// BLEO (L4) : la boîte du label, ce que le podz décline aujourd'hui. Dans
// l'ordre de l'OS : les générations 2 d'abord, puis les familles jamais
// déclinées, puis les verdicts les plus récents. Pour chaque ligne : la sorte
// (G1 : l'accroche du parent mot pour mot ; G2 : l'accroche reformulée), le
// parent à déclarer au dépôt, les déclinaisons déjà faites sur 3, et le post
// parent tel que posté (slides, vues, r).
//
// En tête, la jauge : combien de full tests déposer aujourd'hui (le reste du
// jour en déclinaisons, dans l'ordre de la boîte), et ce qui est déjà déposé.
// Une famille « au budget » passe beaucoup en ce moment : la décliner quand
// même si elle est en tête, ses déclinaisons partiront plus tard.
//
// Dépôt : dans originaux/<id>.json, "type_bleo": "full_test" ou
// "type_bleo": "declinaison" avec "parent_contenu_id": "<id complet>".
// Images du parent : npm run images -- --depuis <id8 du parent>.
// Sortie : donnees/boite.json (la réponse complète).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { appelPod } from "./api.ts";

type Slide = { position: number; texte: string | null; appli: boolean; image: string | null };
type Passage = { langue: string; vues: number; r: number | null; url: string | null };
type Ligne = {
  rang: number;
  sorte: "g1" | "g2";
  accroche_attendue: "identique" | "reformulee";
  accroche: string | null;
  parent_contenu_id: string;
  faites: number;
  au_budget: boolean;
  parent: { titre: string | null; langue_source: string | null; generation: number | null } | null;
  post: (Passage & { slides: Slide[] }) | null;
  passages: Passage[];
};
type Reponse = {
  jour: string;
  jauge: { familles_en_boite: number; semaines: number | null; part_full_test: number; par_jour: number; full_tests_du_jour: number };
  deposes_aujourdhui: { full_test: number; declinaison: number; sans_type: number };
  boite: Ligne[];
};

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const limite = Number(opt("--limite") ?? 30);

// Le rythme du podz (pods/rythme.json, tenu par le chef) : la clé est le nom du dossier.
let parJour: number | undefined;
try {
  const rythme = JSON.parse(readFileSync("../rythme.json", "utf8")) as Record<string, { par_jour?: number; pause?: boolean }>;
  const r = rythme[basename(process.cwd())];
  if (r && !r.pause && typeof r.par_jour === "number") parJour = r.par_jour;
} catch {
  // sans rythme.json : l'OS prend le rythme mesuré sur 7 jours
}

const r = await appelPod<Reponse>({ action: "boite", limite, ...(parJour ? { par_jour: parJour } : {}) });
if (!r.ok) throw new Error(r.error);
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/boite.json", JSON.stringify(r, null, 1));

const k = (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? `${Math.round(n / 100) / 10} k` : String(n));
const j = r.jauge;
const deja = r.deposes_aujourdhui;
const fullTestsRestants = Math.max(0, j.full_tests_du_jour - deja.full_test);
const declinaisonsRestantes = Math.max(0, j.par_jour - j.full_tests_du_jour - deja.declinaison);
console.log(`Boîte du ${r.jour} : ${j.familles_en_boite} famille(s) gagnante(s) à décliner` +
  (j.semaines == null ? "" : `, ${j.semaines} semaine(s) d'avance`));
console.log(`Jauge : ${Math.round(j.part_full_test * 100)} % de full tests → aujourd'hui ${j.full_tests_du_jour} full test(s) sur ${j.par_jour}`);
console.log(`Déjà déposé aujourd'hui : ${deja.full_test} full test(s), ${deja.declinaison} déclinaison(s)` +
  (deja.sans_type ? `, ${deja.sans_type} sans type_bleo` : ""));
console.log(`Reste à faire : ${fullTestsRestants} full test(s), puis ${declinaisonsRestantes} déclinaison(s) dans l'ordre ci-dessous.`);
if (!r.boite.length) {
  console.log("\nBoîte vide : uniquement des full tests aujourd'hui (à signaler dans le compte rendu).");
}

for (const l of r.boite.slice(0, args.includes("--tout") ? r.boite.length : Math.max(declinaisonsRestantes + 3, 5))) {
  const sorte = l.sorte === "g2" ? "G2 · accroche à REFORMULER (même promesse, autres mots)" : "G1 · accroche du parent MOT POUR MOT";
  console.log(`\n#${l.rang} ${sorte} · ${l.faites}/3 faites${l.au_budget ? " · famille au budget (partira plus tard)" : ""}`);
  console.log(`   parent_contenu_id : ${l.parent_contenu_id}  (génération ${l.parent?.generation ?? 0}, ${l.parent?.langue_source ?? "?"})`);
  console.log(`   accroche de la famille : « ${l.accroche ?? "—"} »`);
  if (l.post) {
    console.log(`   post parent (${l.post.langue}, ${k(l.post.vues)} vues, r ${l.post.r ?? "—"}) ${l.post.url ?? ""}`);
    for (const s of l.post.slides) {
      console.log(`     ${s.position}. ${s.appli ? "[appli] " : ""}${(s.texte ?? "").replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
  if (l.passages.length) {
    console.log(`   meilleurs passages : ${l.passages.map((p) => `${p.langue} ${k(p.vues)} (r ${p.r ?? "—"})`).join(" · ")}`);
  }
  console.log(`   images : npm run images -- --depuis ${l.parent_contenu_id.slice(0, 8)}`);
}
