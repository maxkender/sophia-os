// Usage : npm run livrer -- <id> [--langues en] [--complement] [--essai <dossier>]
//
// Rend l'original posts/<id>.json dans les langues du podz (`LANGUES` : l'anglais)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (biomechanic_run) sert Atala : un deck par langue, LA slide
// Atala (le tier « courir » : une photo de course de la banque et le logo
// d'Atala) marquée `position_app` : une seule, ni la couverture ni la
// dernière. Les tiers vont du pire au meilleur (F, D, C, B, A, S).
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, languesDuLabel, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { estSlideAtala, languesCompletes, lirePost, photosSlide, RACINE, rendreSlide, textesSlide } from "./slides.ts";

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
// La slide Atala : une seule, ni la couverture ni la dernière, dans un des deux meilleurs tiers (A ou S).
const atala = post.slides.flatMap((s, i) => (estSlideAtala(s) ? [i] : []));
if (atala.length !== 1) throw new Error(`${id} : une seule slide Atala (trouvé : ${atala.map((i) => i + 1).join(", ") || "aucune"})`);
if (post.slides[0]?.type !== "couverture") throw new Error(`${id} : la couverture d'abord`);
if (atala[0] === post.slides.length - 1) throw new Error(`${id} : la slide Atala n'est jamais la dernière`);
if (post.slides.length < 8 || post.slides.length > 13) throw new Error(`${id} : 8 à 13 slides (trouvé ${post.slides.length})`);
const ORDRE = "FDCBAS";
for (const l of langues) {
  const tiers = post.slides.slice(1).map((s) => (s[l] as { tier?: string } | undefined)?.tier ?? "?");
  if (tiers.some((t, i) => i > 0 && ORDRE.indexOf(t) < ORDRE.indexOf(tiers[i - 1]))) throw new Error(`${id} (${l}) : les tiers vont du pire au meilleur, F → S (trouvé ${tiers.join(" ")})`);
  const tierAtala = (post.slides[atala[0]][l] as { tier?: string } | undefined)?.tier;
  if (!["A", "S"].includes(tierAtala ?? "")) throw new Error(`${id} (${l}) : la slide Atala (courir) est en A ou S tier (trouvé ${tierAtala})`);
}
// Rien de médical : ni complément, ni médicament, ni dosage (ses posts en parlent, jamais les nôtres).
const MEDICAL = /supplement|nootropic|creatine|magnesium|melatonin pill|ashwagandha|tretinoin|retinol|caffeine pill|\bmg\b|dose|dosage|prescription|nicotine|nic[o0]t!?ne|peptide|ghk|testosterone/i;
const medical = post.slides.flatMap((s, i) => (langues.some((l) => MEDICAL.test(textesSlide(s, l))) ? [i + 1] : []));
if (medical.length) throw new Error(`${id} : rien de médical (complément, médicament, dosage) : slides ${medical.join(", ")}`);
// Chaque photo vient de la banque de l'OS (`banque` : chemin → id), jamais deux fois dans le post.
const photos = post.slides.flatMap(photosSlide);
const sansId = photos.filter((p) => !post.banque?.[p]);
if (sansId.length) throw new Error(`${id} : photos sans id de la banque (\`banque\` du post) : ${sansId.join(", ")}`);
if (new Set(photos).size !== photos.length) throw new Error(`${id} : une photo sert deux fois`);
// Atala n'est écrite que sur sa slide ; nulle part ailleurs, ni une concurrente, ni son Telegram.
const CONCURRENTES = /telegram|link in bio|pacewell|runna|nike\s*run\s*club|\bnrc\b|couch\s*(to|2)\s*5\s*k|c25k|runkeeper|runtastic|adidas\s+running\s+app|coopah|kiprun\s+pacer|campus\s+coach|runmotion|trainingpeaks|garmin\s+coach|none\s+to\s+run|trenara|runsmart|runcoach|mapmyrun|zombies,?\s+run|run\s+with\s+hal|strava/i;
const conc = post.slides.flatMap((s, i) => (langues.some((l) => CONCURRENTES.test(textesSlide(s, l))) || langues.some((l) => CONCURRENTES.test(post.legendes[l] ?? "")) ? [i + 1] : []));
if (conc.length) throw new Error(`${id} : une appli concurrente d'Atala est citée (slides ${conc.join(", ")})`);
const ailleurs = post.slides.flatMap((s, i) => (i !== atala[0] && langues.some((l) => /atala/i.test(textesSlide(s, l))) ? [i + 1] : []));
if (ailleurs.length) throw new Error(`${id} : Atala citée hors de sa slide (${ailleurs.join(", ")})`);
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
  .filter((f) => /^aw-\d+\.json$/.test(f) && f < `${id}.json`)
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
  console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(", ")}, slide Atala #${atala[0] + 1})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")}${r.applications ? ` · applications ${JSON.stringify(r.applications)}` : ""}`);
}
