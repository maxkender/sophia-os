// Usage : BANQUE_JETON=… node atelier/cli-etat.ts [application]
//
// Où en est la banque : par label de l'application (atala par défaut), le
// nombre d'images propres et celles venues de Pinterest ; ce qui a été versé
// depuis 24 h face au plafond ; et le stock local de candidates.
import { PLANCHES, appelBanque, lire, lireStock } from "./api.ts";

const application = process.argv[2] ?? "atala";
const stock = Object.values(lireStock());
const planches = lire<Record<string, { refs: string[] }>>(PLANCHES, {});
const surPlanche = new Set(Object.values(planches).flatMap((p) => p.refs));
const sans = stock.filter((c) => !c.decision);
console.log(
  `Candidates vues : ${stock.length} · versées ${stock.filter((c) => c.decision === "versee").length} · écartées ${stock.filter((c) => c.decision === "ecartee").length} · sur une planche ouverte ${sans.filter((c) => surPlanche.has(c.ref)).length} · pas encore sur une planche ${sans.filter((c) => !surPlanche.has(c.ref)).length}`,
);

type Etat = { labels: { label: string; propres: number; pinterest: number }[]; versees_24h: number; par_jour: number };
const e = await appelBanque<Etat>({ action: "etat", application });
if (!e.ok) throw new Error(e.error);
console.log(`Banque ${application} (versées depuis 24 h : ${e.versees_24h} / ${e.par_jour}) :`);
for (const l of e.labels) console.log(`- ${l.label} : ${l.propres} image(s) propre(s), dont ${l.pinterest} de Pinterest`);
if (!e.labels.length) console.log("- aucun label pour cette application");
