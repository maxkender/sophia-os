// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : l'anglais)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (dorian_art) sert Artura seule : un deck par langue, deux
// slides (sa couverture, puis l'iceberg), LA slide Artura (l'iceberg, qui
// porte UN loisir Artura : son logo et un nom qui la cite, jamais une capture
// de l'appli) marquée `position_app: "artura"`. Chaque objet est un vrai
// objet du Met (domaine public), avec sa fiche ; aucune image générée.
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { estSlideApp, languesCompletes, lirePost, loisirs, photosSlide, RACINE, rendreSlide, textesSlide } from "./slides.ts";

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
// Son format : deux slides, sa couverture puis l'iceberg ; un loisir Artura et un seul, sur l'iceberg.
if (post.slides.length !== 2 || post.slides[0].type !== "iceberg_couverture" || post.slides[1].type !== "iceberg") throw new Error(`${id} : deux slides, sa couverture (iceberg_couverture) puis l'iceberg`);
const app = post.slides.flatMap((s, i) => (estSlideApp(s) ? [i] : []));
for (const l of langues) {
  const n = loisirs(post.slides[1], l).filter((h) => h.image === "artura");
  if (n.length !== 1) throw new Error(`${id} (${l}) : un loisir Artura et un seul sur l'iceberg (trouvé ${n.length})`);
  if (!/\bartura\b/i.test(n[0].t)) throw new Error(`${id} (${l}) : le loisir Artura la nomme (« art history on artura »)`);
  const tous = loisirs(post.slides[1], l);
  if (tous.length < 12 || tous.length > 17) throw new Error(`${id} (${l}) : 12 à 17 loisirs, comme lui (trouvé ${tous.length})`);
  const premier = loisirs(post.slides[1], l).slice(0, 4).some((h) => h.image === "artura");
  if (premier) throw new Error(`${id} (${l}) : le loisir Artura n'est pas au premier étage (le plus banal) : plus bas, là où il a sa place`);
}
// Chaque objet : un vrai objet ou une œuvre du domaine public (Met), avec sa fiche, jamais deux fois.
const images = post.slides.flatMap(photosSlide);
for (const im of images) {
  if (!/^images\/(objets|oeuvres)\//.test(im)) throw new Error(`${id} : ${im} : seulement des objets du Met (images/objets/, npm run objet) ou des œuvres (images/oeuvres/, npm run oeuvre), aucune image générée`);
  const f = post.oeuvres?.[im];
  if (!f?.musee || !f?.id) throw new Error(`${id} : fiche manquante (\`oeuvres\` du post : musée, id) pour ${im}`);
}
if (new Set(images).size !== images.length) throw new Error(`${id} : un objet sert deux fois`);
// Jamais une capture de l'appli : seul le logo, posé au rendu.
const captures = images.filter((p) => /artura|capture|screenshot/i.test(p));
if (captures.length) throw new Error(`${id} : pas de capture d'Artura, seulement son logo (posé au rendu) : ${captures.join(", ")}`);
// Artura n'est écrite que sur sa slide ; nulle part une concurrente (applis d'art) ni une autre appli de l'OS.
const CONCURRENTES = /smartify|dailyart|daily\s+art|artsy|google\s+arts|arts\s*&\s*culture|art\s*basel|artstory|the\s+art\s+story|magnus|wikiart|sophia|atala|micabo|unswipe|duolingo|headway|imprint|blinkist/i;
const conc = post.slides.flatMap((s, i) => (langues.some((l) => CONCURRENTES.test(textesSlide(s, l))) || langues.some((l) => CONCURRENTES.test(post.legendes[l] ?? "")) ? [i + 1] : []));
if (conc.length) throw new Error(`${id} : une autre appli est citée (slides ${conc.join(", ")}) : seulement Artura, sur sa slide`);
const ailleurs = post.slides.flatMap((s, i) => (i !== app[0] && langues.some((l) => /artura/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Artura citée hors de sa slide (${ailleurs.join(", ")})`);
const surSaSlide = langues.filter((l) => !/\bartura\b/i.test(textesSlide(post.slides[app[0]], l)));
if (surSaSlide.length) throw new Error(`${id} : la carte Artura cite Artura dans son texte (${surSaSlide.join(", ")})`);
// Jamais un @ ni son nom.
const arobase = post.slides.flatMap((s, i) => (langues.some((l) => /@|dorian|frog/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (arobase.length) throw new Error(`${id} : pas de @ ni de nom de compte sur les slides (${arobase.join(", ")})`);
const enLegende = langues.filter((l) => /artura/i.test(post.legendes[l] ?? "") || /artura/i.test(post.titre[l] ?? ""));
if (enLegende.length) throw new Error(`${id} : pas d'Artura dans le titre ni la légende TikTok (${enLegende.join(", ")})`);
// Jamais une promesse de soin : l'art aide à regarder, il ne soigne pas (ni trauma guéri, ni thérapie remplacée).
const SOIN = /\b(cure[sd]?|heals? (your )?trauma|replace[sd]? therapy|instead of therapy|treat(s|ment)? (your )?(depression|anxiety|ptsd)|diagnos)/i;
const soin = post.slides.flatMap((s, i) => (langues.some((l) => SOIN.test(textesSlide(s, l))) ? [i + 1] : []));
if (soin.length) throw new Error(`${id} : une promesse de soin (guérir, remplacer une thérapie, traiter) : slides ${soin.join(", ")}`);
// Jamais une formule de pub.
const PUB = /\bdownload|link in (my )?bio|\bfree\b|free trial|the best app|\b@/i;
const pub = langues.filter((l) => PUB.test(textesSlide(post.slides[app[0]], l)) || /link in (my )?bio|\bdownload/i.test(post.legendes[l] ?? ""));
if (pub.length) throw new Error(`${id} : formule de pub (download, link in bio, free, the best app, @) : ${pub.join(", ")}`);

const decks: Record<string, { hashtags: string; slides: { position: number; jpeg_base64: string; position_app?: "artura" }[] }> = {};
for (const langue of langues) {
  const slides = [];
  for (const [i, s] of post.slides.entries()) {
    const jpeg = await rendreSlide(post, s, langue);
    const restes = metadonneesRestantes(jpeg);
    if (restes.length) throw new Error(`${langue} #${i + 1} : métadonnées ${restes.join(", ")}`);
    slides.push({ position: i + 1, jpeg_base64: jpeg.toString("base64"), ...(estSlideApp(s) ? { position_app: "artura" as const } : {}) });
  }
  decks[langue] = { hashtags: post.legendes[langue], slides };
}

// Les textes lus par la note de pertinence : chaque slide, dans l'ordre.
const textes = post.slides.map((s) => textesSlide(s, LANGUE_SOURCE)).filter(Boolean);

// Deux originaux inspirés du même post d'un compte modèle : l'OS refuse deux
// contenus de même source_url, on les distingue par « ?variante=<id> ».
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^da-\d+\.json$/.test(f) && f < `${id}.json`)
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
  console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(", ")}, slide Artura #${app[0] + 1})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")}${r.applications ? ` · applications ${JSON.stringify(r.applications)}` : ""}`);
}
