// Usage : npm run livrer -- <id> [--langues en] [--essai <dossier>]
//
// Rend le remake posts/<id>.json dans chaque langue écrite et le DÉPOSE dans
// la file de validation de l'OS (fonction Edge `pods`, action `deposer`).
// Rien n'est diffusé avant validation (à la main, ou toute seule 12 h après).
//
// Le label du pod (Fathomly) sert Sophia : un deck par langue, LA slide Sophia
// marquée `position_sophia` (une seule, jamais la couverture). La carte
// UnSwipe d'une étape est une image du deck comme une autre : l'OS ne la voit
// pas, le champ `notes` du post la dit.
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { type ContenuApp, type ContenuCouverture, type ContenuEtape, contenu, estSlideSophia, languesCompletes, lirePost, RACINE, rendreSlide } from "./slides.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run livrer -- <id> [--langues en] [--essai <dossier>]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const essai = opt("--essai");

const post = lirePost(id);
const completes = languesCompletes(post);
const langues = (opt("--langues")?.split(",") ?? [...LANGUES]).filter((l) => completes.includes(l));
if (!langues.includes(LANGUE_SOURCE)) throw new Error(`${id} : le deck ${LANGUE_SOURCE} n'est pas complet (titre, légende et chaque slide)`);
const sophia = post.slides.flatMap((s, i) => (estSlideSophia(s) ? [i] : []));
if (sophia.length !== 1 || sophia[0] === 0) {
  throw new Error(`${id} : une seule slide Sophia, jamais la couverture (trouvé : ${sophia.map((i) => i + 1).join(", ") || "aucune"})`);
}
const sansVideo = post.slides.flatMap((s, i) => {
  if (s.type !== "etape") return [];
  return langues.filter((l) => {
    const c = contenu<ContenuEtape>(s, l);
    return !c.video && !(c.carte && s.app);
  }).map((l) => `${i + 1} (${l})`);
});
if (sansVideo.length) throw new Error(`${id} : étape sans vraie vidéo ni carte d'appli : ${sansVideo.join(", ")}`);

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

// Les textes lus par la note de pertinence : l'accroche d'abord, puis chaque slide.
const morceaux = (ligne: unknown) => (typeof ligne === "string" ? ligne : (ligne as { t: string }[]).map((m) => (typeof m === "string" ? m : m.t)).join(""));
const textes = post.slides
  .map((s) => {
    if (s.type === "couverture") return contenu<ContenuCouverture>(s, LANGUE_SOURCE).lignes.map(morceaux).join(" ");
    if (s.type === "app") {
      const c = contenu<ContenuApp>(s, LANGUE_SOURCE);
      return [`${c.nom} ${c.sous}`, ...c.texte].join(" ");
    }
    const c = contenu<ContenuEtape>(s, LANGUE_SOURCE);
    const titre = c.titre.map(morceaux).join(" ");
    return c.video ? `${titre} — ${c.video.titre} (${c.video.chaine})` : `${titre} — ${c.carte?.nom ?? ""} : ${c.carte?.texte.join(" ") ?? ""}`;
  })
  .filter(Boolean);

// Une variante refait un post déjà remaké : l'OS refuse deux contenus de même
// source_url, on la distingue par « ?variante=<id> » (comme le podz 10).
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^fa-\d+\.json$/.test(f) && f < `${id}.json`)
  .map((f) => JSON.parse(readFileSync(join(RACINE, "posts", f), "utf8")) as { source?: { url?: string } });
const sourceUrl = anterieurs.some((p) => p.source?.url === post.source.url) ? `${post.source.url}?variante=${id}` : post.source.url;

const corps = {
  action: "deposer",
  pod: POD,
  source_url: sourceUrl,
  source_id: post.id,
  source_vues: post.source.vues,
  titre: post.titre[LANGUE_SOURCE].slice(0, 160),
  langue_source: LANGUE_SOURCE,
  musique_url: post.musique.url,
  musique_titre: post.musique.titre,
  textes,
  decks,
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
