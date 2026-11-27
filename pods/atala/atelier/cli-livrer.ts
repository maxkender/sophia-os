// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : anglais et français)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (dos_donts_run) sert Atala : un deck par langue, LA slide où
// le logo d'Atala est glissé parmi les « Do » marquée `position_app` (une seule,
// jamais la couverture). Jamais de page d'appli entière (demande d'Adrien du 19/11).
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { ATALA, estSlideAtala, imagesSlide, languesCompletes, lirePost, RACINE, rendreSlide, textesSlide } from "./slides.ts";

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
// Le logo d'Atala : UNE vignette dans tout le post, parmi les « Do » d'une slide
// « do & don'ts » ou dans une grille « bonne » (`bon: true`), jamais en couverture.
const atala = post.slides.flatMap((s, i) => (estSlideAtala(s) ? [i] : []));
const logos = post.slides.reduce((n, s) => n + imagesSlide(s).filter((x) => x === ATALA).length, 0);
if (atala.length !== 1 || logos !== 1) throw new Error(`${id} : le logo d'Atala une seule fois dans le post (trouvé ${logos}, slides ${atala.map((i) => i + 1).join(", ") || "aucune"})`);
const sa = post.slides[atala[0]];
if (sa.type === "couverture" || (sa.dont ?? []).includes(ATALA) || (sa.type === "grille" && !sa.bon)) {
  throw new Error(`${id} : le logo d'Atala va parmi les « Do » (ou dans une grille « bonne »), jamais en couverture ni dans les « Don't »`);
}
if (post.slides[0]?.type !== "couverture") throw new Error(`${id} : la couverture d'abord`);
if (post.slides.length < 4 || post.slides.length > 7) throw new Error(`${id} : 4 à 7 slides (trouvé ${post.slides.length})`);
// Atala n'est écrit que dans la légende de son logo ; nulle part ailleurs, ni une concurrente.
const CONCURRENTES = /pacewell|runna|nike\s*run\s*club|\bnrc\b|couch\s*(to|2)\s*5\s*k|c25k|runkeeper|runtastic|adidas\s+running\s+app|coopah|kiprun\s+pacer|campus\s+coach|runmotion|trainingpeaks|garmin\s+coach|none\s+to\s+run|trenara|runsmart|runcoach|mapmyrun|zombies,?\s+run|run\s+with\s+hal/i;
const conc = post.slides.flatMap((s, i) => (langues.some((l) => CONCURRENTES.test(textesSlide(s, l))) || langues.some((l) => CONCURRENTES.test(post.legendes[l] ?? "")) ? [i + 1] : []));
if (conc.length) throw new Error(`${id} : une appli concurrente d'Atala est citée (slides ${conc.join(", ")})`);
const ailleurs = post.slides.flatMap((s, i) => (i !== atala[0] && langues.some((l) => /atala/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Atala citée hors de la slide de son logo (${ailleurs.join(", ")})`);
const enLegende = langues.filter((l) => /atala/i.test(post.legendes[l] ?? "") || /atala/i.test(post.titre[l] ?? ""));
if (enLegende.length) throw new Error(`${id} : pas d'Atala dans le titre ni la légende TikTok (${enLegende.join(", ")})`);

const decks: Record<string, { hashtags: string; slides: { position: number; jpeg_base64: string; position_app?: true }[] }> = {};
for (const langue of langues) {
  const slides = [];
  for (const [i, s] of post.slides.entries()) {
    const jpeg = await rendreSlide(post, s, langue);
    const restes = metadonneesRestantes(jpeg);
    if (restes.length) throw new Error(`${langue} #${i + 1} : métadonnées ${restes.join(", ")}`);
    slides.push({ position: i + 1, jpeg_base64: jpeg.toString("base64"), ...(estSlideAtala(s) ? { position_app: true as const } : {}) });
  }
  decks[langue] = { hashtags: post.legendes[langue], slides };
}

// Les textes lus par la note de pertinence : chaque slide, dans l'ordre.
const textes = post.slides.map((s) => textesSlide(s, LANGUE_SOURCE)).filter(Boolean);

// Deux originaux inspirés du même post d'un compte modèle : l'OS refuse deux
// contenus de même source_url, on les distingue par « ?variante=<id> ».
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^at-\d+\.json$/.test(f) && f < `${id}.json`)
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
  console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(", ")}, logo Atala slide #${atala[0] + 1})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")}${r.applications ? ` · applications ${JSON.stringify(r.applications)}` : ""}`);
}
