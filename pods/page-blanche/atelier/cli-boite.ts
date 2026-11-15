// Usage : POD_JETON=… node atelier/cli-boite.ts [--limite 30] [--tout]
//
// BLEO, voie 2 (pods/ROUTINE.md §5) : la boîte du label, les familles
// gagnantes à décliner, dans l'ordre de l'OS (les générations 2 d'abord, puis
// les familles jamais déclinées, puis les verdicts les plus récents). Pour
// chaque ligne : la sorte (G1 : le titre du parent mot pour mot ; G2 : une
// accroche reformulée), le post parent (son id chez nous, pour retrouver ses
// fichiers, et le `parent_contenu_id` à déclarer), les déclinaisons déjà
// faites sur 3, ses meilleurs passages.
//
// En tête, la journée : les langues à livrer (0654 : celles où le label a un
// compte ; l'appel déclare au passage `LANGUES` à l'OS), puis le rattrapage
// (les posts gagnants à livrer dans une langue qui en manque, au plus la moitié
// du jour), puis la jauge, qui donne les full tests du jour (des accroches
// neuves). Le reste du jour va d'abord aux remakes des posts neufs du compte
// modèle, puis aux déclinaisons de la boîte dans l'ordre ; s'il ne reste ni
// l'un ni l'autre, à des full tests.
//
// Dépôt : dans l'entrée du post de posts/manifeste.json, "type_bleo":
// "declinaison" et "parent_contenu_id": "<id complet>", ou "type_bleo":
// "full_test" (déposé sans "url"). Rien pour le remake d'un post du compte modèle.
// Sortie : donnees/boite.json (la réponse complète).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { appelPod, LANGUES } from "./api.ts";

type Passage = { langue: string; vues: number; r: number | null; url: string | null };
type Ligne = {
  rang: number;
  sorte: "g1" | "g2";
  accroche_attendue: "identique" | "reformulee";
  accroche: string | null;
  parent_contenu_id: string;
  faites: number;
  au_budget: boolean;
  parent: { titre: string | null; langue_source: string | null; generation: number | null; source_url: string | null; source_id: string | null } | null;
  post: Passage | null;
  passages: Passage[];
};
type Commande = { rang: number; source_id: string | null; titre: string | null; accroche: string | null; langues: string[]; en_attente: boolean };
type Reponse = {
  jour: string;
  voie: 1 | 2;
  langues: { declarees: string[] | null; comptes: Record<string, number>; a_livrer: string[] | null } | null;
  rattrapage?: { du_jour: number; en_plus?: boolean; commandes: Commande[] };
  rythme?: { par_jour: number; rattrapage_du_jour: number; consommation: number; stock_jours: number | null; compte_le_plus_juste: string | null } | null;
  jauge: { familles_en_boite: number; semaines: number | null; part_full_test: number; par_jour: number; full_tests_du_jour: number };
  deposes_aujourdhui: { full_test: number; declinaison: number; sans_type: number; rattrapage?: number };
  boite: Ligne[];
};

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const limite = Number(opt("--limite") ?? 30);

// Voie 2 (lot 4, 0655) : le rythme vient de l'OS, calculé sur les comptes du
// label ; pods/rythme.json ne garde que la pause (la clé est le nom du dossier).
let pause = false;
try {
  const rythme = JSON.parse(readFileSync("../rythme.json", "utf8")) as Record<string, { pause?: boolean }>;
  pause = rythme[basename(process.cwd())]?.pause === true;
} catch {
  // sans rythme.json : pas de pause
}

const r = await appelPod<Reponse>({ action: "boite", limite, langues: [...LANGUES] });
if (!r.ok) throw new Error(r.error);
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/boite.json", JSON.stringify(r, null, 1));

console.log(r.voie === 2
  ? "Voie 2 (remakes) : suis pods/ROUTINE.md §5."
  : "Attention : l'OS range ce podz en voie 1 (originaux) : suis pods/ROUTINE.md §4.");
if (pause) console.log("PAUSE (pods/rythme.json) : ne livre rien aujourd'hui, mesure seulement (pods/ROUTINE.md §2).");
const k = (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? `${Math.round(n / 100) / 10} k` : String(n));
const j = r.jauge;
const deja = r.deposes_aujourdhui;
const rattrapage = r.rattrapage ?? { du_jour: 0, commandes: [] };
const rattrapagesFaits = deja.rattrapage ?? 0;
const rattrapagesRestants = Math.max(0, rattrapage.du_jour - rattrapagesFaits);
const fullTestsRestants = Math.max(0, j.full_tests_du_jour - deja.full_test);
// 0655 : le rattrapage s'ajoute au rythme calculé (avant : il en prenait une part).
const partRattrapage = rattrapage.en_plus ? 0 : Math.max(rattrapage.du_jour, rattrapagesFaits);
const resteDuJour = Math.max(
  0,
  j.par_jour - partRattrapage - Math.max(j.full_tests_du_jour, deja.full_test) - deja.declinaison - deja.sans_type,
);
if (r.rythme) {
  console.log(`Rythme du jour (calculé par l'OS) : ${r.rythme.par_jour} livraison(s)` +
    (rattrapage.du_jour ? ` + ${rattrapage.du_jour} rattrapage(s)` : "") +
    `. Pourquoi : chaque compte du label en poste ${r.rythme.consommation} par jour` +
    (r.rythme.compte_le_plus_juste
      ? ` ; le plus juste, ${r.rythme.compte_le_plus_juste}, a ${r.rythme.stock_jours} jour(s) de posts jamais publiés.`
      : "."));
}
if (r.langues?.a_livrer) {
  const comptes = Object.entries(r.langues.comptes).map(([l, n]) => `${l} ${n}`).join(" · ") || "aucun";
  console.log(`Langues à livrer : ${r.langues.a_livrer.join(", ") || "aucune"} (comptes du label : ${comptes}) ; npm run livrer s'y tient.`);
}
if (rattrapage.commandes.length) {
  console.log(`\nRattrapage : ${rattrapage.commandes.length} post(s) gagnant(s) à livrer dans une langue qui en manque ; ` +
    `aujourd'hui ${rattrapagesRestants} d'abord (déjà fait : ${rattrapagesFaits}).`);
  for (const c of rattrapage.commandes.slice(0, Math.max(rattrapagesRestants + 2, 3))) {
    console.log(`  #${c.rang} ${c.source_id ?? "?"} → ${c.langues.join(", ")}${c.en_attente ? " (déjà déposé, attend la validation)" : ""} · « ${c.titre ?? c.accroche ?? "—"} »`);
    console.log(`     traduis posts/${c.source_id}.<langue>.json, puis npm run livrer -- sources ${c.source_id} --langues ${c.langues.join(",")}`);
  }
}
console.log("");
console.log(`Boîte du ${r.jour} : ${j.familles_en_boite} famille(s) gagnante(s) à décliner` +
  (j.semaines == null ? "" : `, ${j.semaines} semaine(s) d'avance`));
console.log(`Jauge : ${Math.round(j.part_full_test * 100)} % de full tests → aujourd'hui ${j.full_tests_du_jour} full test(s) sur ${j.par_jour}`);
console.log(`Déjà déposé aujourd'hui : ${rattrapagesFaits} rattrapage(s), ${deja.full_test} full test(s), ${deja.declinaison} déclinaison(s), ${deja.sans_type} remake(s) du compte modèle`);
console.log(`Reste à faire : ${rattrapagesRestants} rattrapage(s), ${fullTestsRestants} full test(s), puis ${resteDuJour} livraison(s) : ` +
  "d'abord les posts neufs du compte modèle, puis les déclinaisons ci-dessous dans l'ordre, sinon des full tests.");
if (!r.boite.length) {
  console.log("\nBoîte vide : le reste du jour en remakes des posts neufs du compte modèle, sinon en full tests.");
}

for (const l of r.boite.slice(0, args.includes("--tout") ? r.boite.length : Math.max(resteDuJour + 3, 5))) {
  const sorte = l.sorte === "g2" ? "G2 · accroche à REFORMULER (même promesse, autres mots)" : "G1 · titre du parent MOT POUR MOT";
  console.log(`\n#${l.rang} ${sorte} · ${l.faites}/3 faites${l.au_budget ? " · famille au budget (partira plus tard)" : ""}`);
  console.log(`   parent : ${l.parent?.source_id ?? "?"} · parent_contenu_id ${l.parent_contenu_id}` +
    ` (génération ${l.parent?.generation ?? 0}, langue du titre : ${l.parent?.langue_source ?? "?"})`);
  console.log(`   titre du parent : « ${l.parent?.titre ?? "—"} »`);
  console.log(`   accroche de la famille : « ${l.accroche ?? "—"} »`);
  if (l.parent?.source_url) console.log(`   post modèle : ${l.parent.source_url}`);
  if (l.post) console.log(`   meilleur passage (${l.post.langue}, ${k(l.post.vues)} vues, r ${l.post.r ?? "—"}) ${l.post.url ?? ""}`);
  if (l.passages.length) {
    console.log(`   passages : ${l.passages.map((p) => `${p.langue} ${k(p.vues)} (r ${p.r ?? "—"})`).join(" · ")}`);
  }
}
