// Usage : npm run livrer -- <id> [--langues en] [--essai <dossier>]
//
// Rend le remake posts/<id>.json en anglais, français et allemand (`LANGUES`)
// et le DÉPOSE dans la file de validation de l'OS (fonction Edge `pods`,
// action `deposer`). Un deck incomplet arrête la livraison : chaque compte du
// label poste dans une seule langue, un post sans la sienne le laisserait à sec.
// Rien n'est diffusé avant validation (à la main, ou toute seule 5 h après).
//
// Le label du pod (Kaja) sert Sophia : un deck par langue, LA slide Sophia
// marquée `position_sophia` (une seule, une étape, jamais la couverture).
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { type ContenuCouverture, type ContenuEtape, contenu, estSlideSophia, languesCompletes, lirePost, RACINE, rendreSlide } from "./slides.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run livrer -- <id> [--langues en] [--essai <dossier>]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const essai = opt("--essai");

const post = lirePost(id);
const completes = languesCompletes(post);
const langues = opt("--langues")?.split(",") ?? [...LANGUES];
const incompletes = langues.filter((l) => !completes.includes(l));
if (incompletes.length) {
  throw new Error(`${id} : deck ${incompletes.join(", ")} incomplet (titre, légende et chaque slide) ; chaque livraison part en ${LANGUES.join(", ")}`);
}
if (!langues.includes(LANGUE_SOURCE)) throw new Error(`${id} : le deck ${LANGUE_SOURCE} part toujours, ajoute-le à --langues`);
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

// Deux posts ne montrent jamais la même vidéo dans une langue : le compte de
// cette langue publierait deux fois la même miniature.
const dejaMontrees = new Map<string, string>();
for (const f of readdirSync(join(RACINE, "posts"))) {
  const autre = f.replace(/\.json$/, "");
  if (!/^ka-\d+\.json$/.test(f) || autre === id) continue;
  for (const s of lirePost(autre).slides) {
    for (const l of langues) {
      const v = s.type === "etape" ? contenu<ContenuEtape | undefined>(s, l)?.video : undefined;
      if (v) dejaMontrees.set(`${l}:${v.id}`, autre);
    }
  }
}
const doublons = post.slides.flatMap((s, i) =>
  langues.flatMap((l) => {
    const v = s.type === "etape" ? contenu<ContenuEtape>(s, l).video : undefined;
    const autre = v && dejaMontrees.get(`${l}:${v.id}`);
    return autre ? [`${i + 1} (${l}, déjà dans ${autre})`] : [];
  }),
);
if (doublons.length) throw new Error(`${id} : vidéo déjà montrée par un autre post : ${doublons.join(", ")}`);

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
    if (s.type === "couverture") {
      const c = contenu<ContenuCouverture>(s, LANGUE_SOURCE);
      return [c.chiffre ?? "10/10", ...c.lignes.map(morceaux)].join(" ");
    }
    const c = contenu<ContenuEtape>(s, LANGUE_SOURCE);
    const titre = c.titre.map(morceaux).join(" ");
    const temps = c.sous?.length ? ` (${c.sous.join(" ")})` : "";
    return c.video ? `${titre}${temps} — ${c.video.titre} (${c.video.chaine})` : `${titre}${temps} — ${c.carte?.nom ?? ""} : ${c.carte?.texte.join(" ") ?? ""}`;
  })
  .filter(Boolean);

// Une variante refait un post déjà remaké : l'OS refuse deux contenus de même
// source_url, on la distingue par « ?variante=<id> » (comme les podz 10 et 11).
const anterieurs = readdirSync(join(RACINE, "posts"))
  .filter((f) => /^ka-\d+\.json$/.test(f) && f < `${id}.json`)
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
