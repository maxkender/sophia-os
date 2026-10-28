// Usage : node atelier/cli-doublons.ts [source_id…]
//
// Reprendre un titre de slide 1 ou une couverture est permis (c'est le principe
// des variantes ; la règle des 10 jours du 28/10 a été retirée), à condition
// que chaque reprise change quelque chose : autres items, autre angle, autre
// image ou autre CTA. Ce contrôle liste les originaux qui partagent la
// couverture (media_id de la slide 1) ou le titre de slide 1 avec un autre
// original, pour vérifier à l'œil que la reprise est voulue.
// Avec des ids en argument, il ne montre que les doublons qui les touchent.
// La date de chaque original est celle de son premier commit (git log).
// Une même image sous un autre media_id ne se voit pas ici : regarde l'aperçu.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import type { Original } from "./api.ts";

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
    alertes++;
    console.log(`${a.id} (${a.date}) · ${b.id} (${b.date}) · ${quoi.join(" et ")} · ${ecart(a.date, b.date)} j d'écart`);
  }
}
console.log(alertes ? `${alertes} reprise(s) : vérifie que chacune change les items, l'angle, les images ou le CTA.` : "Aucune reprise de couverture ni de titre.");
