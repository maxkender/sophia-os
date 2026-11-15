// Usage :
//   npm run youtube -- "gérer son argent" [--langue fr] [--n 12]
//   npm run youtube -- --id kVnyY17VS9Y [--langue fr] [--recherche "titre de la vidéo"]
//
// Les VRAIES vidéos d'une étape : la recherche liste les résultats de YouTube
// (vues, date, durée, chaîne) ; `--id` relève les chiffres exacts d'une vidéo
// et écrit le bloc `video` à coller dans le post, au format de l'appli dans la
// langue du deck (« 7 M de vues · il y a 1 an »). Jamais de vidéo inventée ni
// de chiffre retouché.

import { chercher, details } from "./youtube.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const langue = opt("--langue") ?? "fr";
const id = opt("--id");

if (id) {
  const v = await details(id, langue, opt("--recherche"));
  console.log(`${v.titre} · ${v.chaine} · ${v.vues_exactes?.toLocaleString("fr-FR") ?? "?"} vues exactes · ${v.date} · ${v.duree}`);
  console.log(`miniature : https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
  const { vues_exactes: _v, ...video } = v;
  console.log(JSON.stringify({ video }, null, 1));
} else {
  const requete = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))).join(" ");
  if (!requete.trim()) throw new Error('usage : npm run youtube -- "gérer son argent" [--langue fr] | --id <id>');
  for (const r of await chercher(requete, langue, Number(opt("--n") ?? 12))) {
    console.log(`${r.id} | ${r.vues.padStart(18)} | ${r.date.padStart(14)} | ${r.duree.padStart(8)} | ${r.chaine.slice(0, 26).padEnd(26)} | ${r.titre.slice(0, 80)}`);
  }
}
