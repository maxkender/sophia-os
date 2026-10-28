// Usage : node atelier/cli-doublons.ts [source_id…]
//
// Règle §4.7 de pods/ROUTINE.md : un titre de slide 1 mot pour mot, ou une
// couverture identique, ne revient pas avant 10 jours, et au plus 1 reprise
// par lot. Ce contrôle liste les originaux qui partagent la couverture
// (media_id de la slide 1) ou le titre de slide 1 avec un autre original.
// Avec des ids en argument, il ne montre que les doublons qui les touchent.
// La date de chaque original est celle de son premier commit (git log).
// Une même image sous un autre media_id ne se voit pas ici : regarde l'aperçu.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import type { Original } from "./api.ts";

const JOURS_MIN = 10;
const cibles = process.argv.slice(2);

const dateDe = (fichier: string) => {
  const d = execSync(`git log --diff-filter=A --format=%as -- ${fichier}`, { encoding: "utf8" }).trim().split("\n").pop();
  return d || new Date().toISOString().slice(0, 10);
};

const originaux = readdirSync("originaux")
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
    return { id: o.source_id, couverture: o.slides[0].media_id, titre: o.slides[0].texte_overlay.replace(/\s+/g, " ").trim(), date: dateDe(`originaux/${f}`) };
  });

const ecart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
let alertes = 0;
for (const [i, a] of originaux.entries()) {
  for (const b of originaux.slice(i + 1)) {
    if (cibles.length && !cibles.includes(a.id) && !cibles.includes(b.id)) continue;
    const quoi = [a.couverture === b.couverture && "même couverture", a.titre === b.titre && "même titre"].filter(Boolean);
    if (!quoi.length) continue;
    const j = ecart(a.date, b.date);
    const ok = j >= JOURS_MIN;
    if (!ok) alertes++;
    console.log(`${ok ? "ok    " : "REFUS "} ${a.id} (${a.date}) · ${b.id} (${b.date}) · ${quoi.join(" et ")} · ${j} j d'écart`);
  }
}
console.log(alertes ? `${alertes} reprise(s) à moins de ${JOURS_MIN} jours : change la couverture ou le titre.` : "Aucune reprise à moins de 10 jours.");
process.exitCode = alertes ? 1 : 0;
