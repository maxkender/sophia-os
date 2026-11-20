// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : l'anglais)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (cozy_girl) sert Sophia : un deck par langue, LA slide
// Sophia (la carte d'appli qui prend la place de Turbo AI, avec sa vraie
// icône) marquée `position_sophia` : une seule, jamais la couverture.
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { estSlideSophia, languesCompletes, lirePost, RACINE, rendreSlide, textesSlide } from "./slides.ts";

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
const utiles = os?.a_livrer ? new Set<string>(os.a_livrer) : null;
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
// La slide Sophia : une seule, une carte d'appli, jamais la couverture.
const appli = post.slides.flatMap((s, i) => (estSlideSophia(s) ? [i] : []));
if (appli.length !== 1) throw new Error(`${id} : une seule slide Sophia (trouvé : ${appli.map((i) => i + 1).join(", ") || "aucune"})`);
if (post.slides[0]?.type !== "couverture") throw new Error(`${id} : la couverture d'abord`);
if (post.slides[appli[0]].type !== "appli") throw new Error(`${id} : la slide Sophia est une carte d'appli`);
if (post.slides.length < 4 || post.slides.length > 8) throw new Error(`${id} : 4 à 8 slides (trouvé ${post.slides.length})`);
for (const l of langues) {
  const nom = (post.slides[appli[0]][l] as { nom?: string } | undefined)?.nom ?? "";
  if (nom !== "Sophia") throw new Error(`${id} (${l}) : la carte Sophia s'appelle « Sophia » (le nom de l'écran d'accueil)`);
}
// Sophia n'est écrite que sur sa slide ; nulle part une appli concurrente de
// Sophia (apprentissage, culture générale, langues, résumés de livres, temps
// d'écran : la liste du podz 18), ni Turbo AI (la sienne) et les applis de
// révision par l'IA qu'on retire de ses posts.
const CONCURRENTES = /duolingo|kaja|fathom|brilliant|elevate|imprint|headway|blinkist|wondering|uptime|nibble|khan|coursera|udemy|babbel|busuu|speak\b|opal|one ?sec|screenzen|clearspace|freedom|appblock|brick|forest|flora|jomo|refocus|turbo\s*ai|turbolearn|quizlet|\banki\b|knowt|studyfetch|gizmo|brainscape|mindgrasp|coconote|notegpt|unstuck|revisely|quizgecko|studocu|chegg|course\s*hero|photomath|gauth|question\s*ai|answer\s*ai|remnote|memrise|cram\b|algor|scholarly|wisdolia|studdy/i;
const conc = post.slides.flatMap((s, i) => (langues.some((l) => CONCURRENTES.test(textesSlide(s, l))) || langues.some((l) => CONCURRENTES.test(post.legendes[l] ?? "")) ? [i + 1] : []));
if (conc.length) throw new Error(`${id} : une appli concurrente de Sophia est citée (slides ${conc.join(", ")})`);
const ailleurs = post.slides.flatMap((s, i) => (i !== appli[0] && langues.some((l) => /sophia/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Sophia citée hors de sa slide (${ailleurs.join(", ")})`);
const enLegende = langues.filter((l) => /sophia/i.test(post.legendes[l] ?? "") || /sophia/i.test(post.titre[l] ?? ""));
if (enLegende.length) throw new Error(`${id} : pas de Sophia dans le titre ni la légende TikTok (${enLegende.join(", ")})`);
// Jamais une formule de pub (prompt placement_sophia).
const PUB = /\bdownload|link in (my )?bio|\bfree\b|the best app/i;
const pub = langues.filter((l) => PUB.test(textesSlide(post.slides[appli[0]], l)) || PUB.test(post.legendes[l] ?? ""));
if (pub.length) throw new Error(`${id} : formule de pub (download, link in bio, free, the best app) : ${pub.join(", ")}`);

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

// Deux originaux inspirés du même post d'un compte modèle : l'OS refuse deux
// contenus de même source_url, on les distingue par « ?variante=<id> ».
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^sm-\d+\.json$/.test(f) && f < `${id}.json`)
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
  console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(", ")}, slide Sophia #${appli[0] + 1})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")}${r.applications ? ` · applications ${JSON.stringify(r.applications)}` : ""}`);
}
