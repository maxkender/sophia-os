// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : l'anglais)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (Appshelf) sert Sophia : un deck par langue, LA slide Sophia
// marquée `position_sophia` (une seule, une slide d'appli, jamais la couverture ni la fin).
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { type AppliSlide, contenu, estSlideSophia, languesCompletes, lirePost, RACINE, rendreSlide, textesSlide } from "./slides.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const essai = opt("--essai");

const post = lirePost(id);
const completes = languesCompletes(post);
// 0654 : seulement les langues où le label a un compte (l'OS les donne), la
// langue source toujours pour un post neuf. --complement : un rattrapage (post
// déjà validé), seulement les langues demandées, sans la langue source.
const complement = args.includes("--complement");
const os = await languesDuLabel();
// Adrien 27/11 : on livre dans TOUTES les langues ouvertes du podz (sa liste LANGUES),
// même là où le label n'a pas encore de compte : le deck attend le compte dans la file.
const utiles = os?.a_livrer ? new Set<string>([...LANGUES]) : null;
const demandees = opt("--langues")?.split(",").map((l) => l.trim()).filter(Boolean) ?? [...LANGUES];
const sansCompte = utiles ? demandees.filter((l) => l !== LANGUE_SOURCE && !utiles.has(l)) : [];
if (sansCompte.length) console.log(`${id} : pas de compte du label en ${sansCompte.join(", ")} : non livré`);
const voulues = demandees.filter((l) => !sansCompte.includes(l) && !(complement && l === LANGUE_SOURCE));
const langues = voulues;
const incompletes = langues.filter((l) => !completes.includes(l));
if (incompletes.length) {
  throw new Error(`${id} : deck ${incompletes.join(", ")} incomplet (titre, légende et chaque slide) ; chaque livraison part dans les langues du label (${langues.join(", ")})`);
}
if (!completes.includes(LANGUE_SOURCE)) throw new Error(`${id} : le deck ${LANGUE_SOURCE} n'est pas complet (titre, légende et chaque slide)`);
if (!complement && !langues.includes(LANGUE_SOURCE)) throw new Error(`${id} : le deck ${LANGUE_SOURCE} part toujours avec un post neuf, ajoute-le à --langues`);
if (!langues.length) throw new Error(`${id} : aucune langue à livrer`);
const sophia = post.slides.flatMap((s, i) => (estSlideSophia(s) ? [i] : []));
if (sophia.length !== 1 || sophia[0] === 0) {
  throw new Error(`${id} : une seule slide Sophia, jamais la couverture (trouvé : ${sophia.map((i) => i + 1).join(", ") || "aucune"})`);
}
// Cinq applis, Sophia ni la première ni la dernière ; aucune concurrente de Sophia.
const applis = post.slides.flatMap((s, i) => (s.type === "appli" ? [i] : []));
if (applis.length < 3 || applis.length > 7) throw new Error(`${id} : 3 à 7 applis (trouvé : ${applis.length})`);
if (sophia[0] === applis[0] || sophia[0] === applis[applis.length - 1]) throw new Error(`${id} : Sophia n'est ni la première ni la dernière appli`);
const CONCURRENTES = /duolingo|kaja|fathom|brilliant|elevate|imprint|headway|blinkist|wondering|uptime|nibble|quizlet|khan|coursera|udemy|babbel|busuu|memrise|speak|opal|one ?sec|screenzen|clearspace|freedom|appblock|brick|forest|jomo|refocus/i;
const concurrentes = applis.filter((i) => langues.some((l) => CONCURRENTES.test(contenu<AppliSlide>(post.slides[i], l).nom)));
if (concurrentes.length) throw new Error(`${id} : appli concurrente de Sophia (apprentissage ou temps d'écran) : slides ${concurrentes.map((i) => i + 1).join(", ")}`);

// Les autres slides ne parlent pas de Sophia : une seule slide de l'appli.
const ailleurs = post.slides.flatMap((s, i) => (i !== sophia[0] && langues.some((l) => /sophia/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Sophia citée hors de sa slide (${ailleurs.join(", ")})`);

const decks: Record<string, { hashtags: string; slides: { position: number; jpeg_base64: string; position_sophia?: true }[] }> = {};
for (const langue of langues) {
  const slides = [];
  for (const [i, s] of post.slides.entries()) {
    const jpeg = await rendreSlide(post, s, langue);
    const restes = metadonneesRestantes(jpeg);
    if (restes.length) throw new Error(`${langue} #${i + 1} : métadonnées ${restes.join(", ")}`);
    slides.push({ position: i + 1, jpeg_base64: jpeg.toString("base64"), ...(estSlideSophia(s) ? { position_sophia: true as const } : {}) });
  }
  decks[langue] = { hashtags: post.legendes[langue], slides };
}

// Les textes lus par la note de pertinence : chaque slide, dans l'ordre.
const textes = post.slides.map((s) => textesSlide(s, LANGUE_SOURCE)).filter(Boolean);

// Deux originaux inspirés du même post de @theappshelf : l'OS refuse deux
// contenus de même source_url, on les distingue par « ?variante=<id> ».
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^as-\d+\.json$/.test(f) && f < `${id}.json`)
  .map((f) => JSON.parse(readFileSync(join(RACINE, "posts", f), "utf8")) as { source?: { url?: string } });
const sourceUrl = anterieurs.some((p) => p.source?.url === post.source?.url && post.source?.url) ? `${post.source?.url}?variante=${id}` : post.source?.url;

const corps = {
  action: "deposer",
  pod: POD,
  // Un full test (accroche neuve) part sans le post modèle : un original en images finies, rang fixe.
  source_url: post.type_bleo === "full_test" ? null : sourceUrl,
  source_id: post.id,
  source_vues: post.type_bleo === "full_test" ? undefined : post.source?.vues,
  titre: post.titre[LANGUE_SOURCE].slice(0, 160),
  langue_source: LANGUE_SOURCE,
  musique_url: post.musique.url,
  musique_titre: post.musique.titre,
  textes,
  decks,
  // BLEO (pods/ROUTINE.md §5) : jugé au guichet sur la boîte du label ; refusé avec un code sinon.
  ...(post.type_bleo ? { type_bleo: post.type_bleo, ...(post.parent_contenu_id ? { parent_contenu_id: post.parent_contenu_id } : {}) } : {}),
};

if (essai) {
  mkdirSync(essai, { recursive: true });
  writeFileSync(join(essai, `${id}.depot.json`), JSON.stringify(corps));
  console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(", ")}, slide Sophia #${sophia[0] + 1})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[] }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")}`);
}
