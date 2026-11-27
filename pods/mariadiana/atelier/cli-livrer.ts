// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : l'anglais)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (mariadiana_art) sert Artura seule : un deck par langue, LA
// slide Artura (une œuvre dont le paragraphe cite Artura, son LOGO posé sous le
// paragraphe, jamais une capture de l'appli) marquée `position_app: "artura"` :
// une seule, ni la couverture, ni la première œuvre.
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { estSlideApp, languesCompletes, lirePost, photosSlide, RACINE, rendreSlide, textesSlide } from "./slides.ts";

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
// La slide Artura : une seule, ni la couverture, ni la première œuvre.
const app = post.slides.flatMap((s, i) => (estSlideApp(s) ? [i] : []));
if (app.length !== 1) throw new Error(`${id} : une seule slide Artura (trouvé : ${app.map((i) => i + 1).join(", ") || "aucune"})`);
if (post.slides[0]?.type !== "couverture") throw new Error(`${id} : la couverture d'abord`);
if (post.slides.slice(1).some((s) => s.type === "couverture")) throw new Error(`${id} : une seule couverture`);
if (app[0] <= 1) throw new Error(`${id} : la slide Artura n'est ni la couverture ni la première œuvre`);
if (post.slides.length < 4 || post.slides.length > 8) throw new Error(`${id} : 4 à 8 slides (trouvé ${post.slides.length})`);
// Les tableaux : de vraies œuvres du domaine public, chacune avec sa fiche (`oeuvres` du post : musée, id) ; la couverture : Seedream ou la banque.
const images = post.slides.flatMap(photosSlide);
for (const [i, s] of post.slides.entries()) {
  if (s.type === "couverture") {
    // Depuis le 27/11 (Adrien) : jamais d'image IA ; une vraie photo de musée de la banque de l'OS (npm run photos).
    if (!s.image.startsWith("images/banque/")) throw new Error(`${id} : la photo de couverture vient de la banque de l'OS (images/banque/, npm run photos), jamais d'une image IA`);
    if (s.image.startsWith("images/banque/") && !post.banque?.[s.image]) throw new Error(`${id} : photo de la banque sans id (\`banque\` du post) : ${s.image}`);
  } else {
    if (!s.image.startsWith("images/oeuvres/")) throw new Error(`${id} slide ${i + 1} : un tableau vient de images/oeuvres/ (npm run oeuvre), jamais généré`);
    const f = post.oeuvres?.[s.image];
    if (!f?.musee || !f?.id) throw new Error(`${id} slide ${i + 1} : fiche de l'œuvre manquante (\`oeuvres\` du post : musée, id) pour ${s.image}`);
  }
}
if (new Set(images).size !== images.length) throw new Error(`${id} : une image sert deux fois`);
// Jamais une capture de l'appli : seul le logo, posé au rendu.
const captures = images.filter((p) => /artura|capture|screenshot/i.test(p));
if (captures.length) throw new Error(`${id} : pas de capture d'Artura, seulement son logo (posé au rendu) : ${captures.join(", ")}`);
// Artura n'est écrite que sur sa slide ; nulle part une concurrente (applis d'art) ni une autre appli de l'OS.
const CONCURRENTES = /smartify|dailyart|daily\s+art|artsy|google\s+arts|arts\s*&\s*culture|art\s*basel|artstory|the\s+art\s+story|magnus|wikiart|sophia|atala|micabo|unswipe|duolingo|headway|imprint|blinkist/i;
const conc = post.slides.flatMap((s, i) => (langues.some((l) => CONCURRENTES.test(textesSlide(s, l))) || langues.some((l) => CONCURRENTES.test(post.legendes[l] ?? "")) ? [i + 1] : []));
if (conc.length) throw new Error(`${id} : une autre appli est citée (slides ${conc.join(", ")}) : seulement Artura, sur sa slide`);
const ailleurs = post.slides.flatMap((s, i) => (i !== app[0] && langues.some((l) => /artura/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Artura citée hors de sa slide (${ailleurs.join(", ")})`);
const surSaSlide = langues.filter((l) => !/\bArtura\b/.test(textesSlide(post.slides[app[0]], l)));
if (surSaSlide.length) throw new Error(`${id} : la slide Artura cite Artura dans son paragraphe (${surSaSlide.join(", ")})`);
const enLegende = langues.filter((l) => /artura/i.test(post.legendes[l] ?? "") || /artura/i.test(post.titre[l] ?? ""));
if (enLegende.length) throw new Error(`${id} : pas d'Artura dans le titre ni la légende TikTok (${enLegende.join(", ")})`);
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
  .filter((f) => /^md-\d+\.json$/.test(f) && f < `${id}.json`)
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
