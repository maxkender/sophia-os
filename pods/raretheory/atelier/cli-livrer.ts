// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : l'anglais)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (raretheory) sert Sophia seule : un deck par langue, LA slide
// Sophia (un point de la liste dont la petite photo est le LOGO de Sophia,
// jamais une capture de l'appli) marquée `position_sophia` : une seule, au
// milieu de la liste (ni la couverture, ni la première, ni la dernière
// catégorie, ni la fin).
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { estSlideSophia, languesCompletes, lirePost, photosSlide, RACINE, rendreSlide, textesSlide } from "./slides.ts";

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
// La slide Sophia : une seule, au milieu de la liste.
const sophia = post.slides.flatMap((s, i) => (estSlideSophia(s) ? [i] : []));
if (sophia.length !== 1) throw new Error(`${id} : une seule slide Sophia (trouvé : ${sophia.map((i) => i + 1).join(", ") || "aucune"})`);
if (post.slides[0]?.type !== "couverture") throw new Error(`${id} : la couverture d'abord`);
if (post.slides[post.slides.length - 1]?.type !== "fin") throw new Error(`${id} : la fin (son paragraphe et sa phrase en gras) en dernier`);
if (post.slides.slice(1, -1).some((s) => s.type === "couverture" || s.type === "fin")) throw new Error(`${id} : une seule couverture, une seule fin`);
if (sophia[0] <= 2 || sophia[0] >= post.slides.length - 2) throw new Error(`${id} : la slide Sophia vient au milieu de la liste (ni dans les deux premières, ni la dernière avant la fin)`);
if (post.slides.length < 7 || post.slides.length > 11) throw new Error(`${id} : 7 à 11 slides (trouvé ${post.slides.length})`);
// Ses posts sont tout en minuscules (« u », « ur ») ; seuls les noms propres, les sigles et Sophia gardent leur capitale.
for (const l of langues) {
  for (const [i, s] of post.slides.entries()) {
    if (s.type === "categorie") continue; // ses titres et sujets de catégorie ont des capitales (« History & Civilizations »)
    const t = textesSlide(post, s, l).replace(/\b(Sophia|I)\b/g, "");
    const debuts = t.match(/(^|[.!?]\s+)[A-Z][a-z]/g);
    if (debuts && s.type !== "fin") throw new Error(`${id} (${l}) slide ${i + 1} : tout en minuscules comme chez elle (« ${debuts[0].trim()}… »)`);
  }
}
// Chaque photo vient de la banque de l'OS (`banque` : chemin → id), jamais deux fois dans le post.
const photos = post.slides.flatMap(photosSlide);
const sansId = photos.filter((p) => !post.banque?.[p]);
if (sansId.length) throw new Error(`${id} : photos sans id de la banque (\`banque\` du post) : ${sansId.join(", ")}`);
if (new Set(photos).size !== photos.length) throw new Error(`${id} : une photo sert deux fois`);
// Jamais une capture de l'appli (demande d'Adrien du 20/11) : seul le logo, posé au rendu.
const captures = photos.filter((p) => /sophia|capture|screen|ecran/i.test(p));
if (captures.length) throw new Error(`${id} : pas de capture de Sophia, seulement son logo (posé au rendu) : ${captures.join(", ")}`);
// Sophia n'est écrite que sur sa slide ; nulle part une concurrente (apprentissage, culture générale, résumés, temps d'écran).
const CONCURRENTES = /mochivia|duolingo|kaja|fathom|brilliant|elevate|lumosity|peak\s+brain|imprint|headway|blinkist|wondering|uptime|nibble|quizlet|anki|khan|coursera|udemy|skillshare|masterclass|babbel|busuu|memrise|opal|one ?sec|screenzen|clearspace|freedom|appblock|brick|forest|jomo|refocus/i;
const conc = post.slides.flatMap((s, i) => (langues.some((l) => CONCURRENTES.test(textesSlide(post, s, l))) || langues.some((l) => CONCURRENTES.test(post.legendes[l] ?? "")) ? [i + 1] : []));
if (conc.length) throw new Error(`${id} : une appli concurrente de Sophia est citée (slides ${conc.join(", ")})`);
const ailleurs = post.slides.flatMap((s, i) => (i !== sophia[0] && langues.some((l) => /sophia/i.test(textesSlide(post, s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Sophia citée hors de sa slide (${ailleurs.join(", ")})`);
const enLegende = langues.filter((l) => /sophia/i.test(post.legendes[l] ?? "") || /sophia/i.test(post.titre[l] ?? ""));
if (enLegende.length) throw new Error(`${id} : pas de Sophia dans le titre ni la légende TikTok (${enLegende.join(", ")})`);
// Jamais une formule de pub (prompt placement_sophia).
const PUB = /\bdownload|link in (my )?bio|\bfree\b|the best app|\b@/i;
const pub = langues.filter((l) => PUB.test(textesSlide(post, post.slides[sophia[0]], l)) || /link in (my )?bio|\bdownload/i.test(post.legendes[l] ?? ""));
if (pub.length) throw new Error(`${id} : formule de pub (download, link in bio, free, the best app, @) : ${pub.join(", ")}`);

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
const textes = post.slides.map((s) => textesSlide(post, s, LANGUE_SOURCE)).filter(Boolean);

// Deux originaux inspirés du même post d'un compte modèle : l'OS refuse deux
// contenus de même source_url, on les distingue par « ?variante=<id> ».
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^rt-\d+\.json$/.test(f) && f < `${id}.json`)
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
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")}${r.applications ? ` · applications ${JSON.stringify(r.applications)}` : ""}`);
}
