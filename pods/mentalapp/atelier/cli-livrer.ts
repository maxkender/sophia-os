// Usage : npm run livrer -- <id> [--langues en,fr] [--essai <dossier>]
//
// Rend le remake d'un post dans chaque langue (posts/<id>.json) et le DÉPOSE
// dans la file de validation de l'OS (fonction Edge `pods`, action `deposer`).
// Rien n'est diffusé avant qu'un admin valide dans Pilotage → Pods.
//
// Le label du pod (mentalmaxxing) ne sert qu'UnSwipe : un deck par langue, la
// slide de l'élément UnSwipe marquée `position_app` ; l'OS en tire la variante
// UnSwipe, note la pertinence avec le prompt UnSwipe et la note d'import avec
// les vues du post source.
//
// Environnement : POD_JETON (jeton de l'agent du pod). --essai écrit le corps
// de la requête sur disque au lieu de l'envoyer.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadImage } from "@napi-rs/canvas";
import { appelPod, ecrireManifeste, LANGUE_SOURCE, LANGUES, lireManifeste, POD, type Langue } from "./api.ts";
import { CHEMIN_ICONE } from "./app.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { lignesDe, rendreSlide } from "./rendu.ts";
import { lireTranscription, textesAnglais } from "./transcription.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run livrer -- <id> [--langues en,fr] [--essai <dossier>]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const langues = (opt("--langues")?.split(",") ?? [...LANGUES]) as Langue[];
const essai = opt("--essai");

const t = lireTranscription(id);
if (!t.app) throw new Error(`${id} : pas d'élément UnSwipe (app) dans la transcription, rien à promouvoir`);
const manifeste = lireManifeste();
const post = manifeste.posts.find((p) => p.id === id);
if (!post) throw new Error(`${id} absent de sources/manifeste.json`);
if (post.statut === "exclu") throw new Error(`${id} est exclu : ${post.motif ?? ""}`);

const icone = await loadImage(CHEMIN_ICONE);
const bilan: string[] = [];
const decks: Record<string, { hashtags: string; slides: { position: number; jpeg_base64: string; position_app?: true }[] }> = {};
for (const langue of langues) {
  // Une langue n'est livrée que si tous ses textes sont écrits.
  const manque = t.slides.flatMap((s) => s.blocs.filter((b) => b.action === "traduire" && !lignesDe(b, langue)).map((b) => `#${s.position} ${b.id}`));
  if (manque.length) {
    bilan.push(`${langue} : ignorée, textes manquants (${manque.join(", ")})`);
    continue;
  }
  if (!t.legendes[langue]) {
    bilan.push(`${langue} : ignorée, pas de légende`);
    continue;
  }
  const slides = [];
  for (const s of [...t.slides].sort((a, b) => a.position - b.position)) {
    const r = await rendreSlide(`sources/${id}/${s.position}.jpg`, t, s.position, langue, icone);
    const restes = metadonneesRestantes(r.jpeg);
    if (restes.length) throw new Error(`${langue} #${s.position} : métadonnées ${restes.join(", ")}`);
    bilan.push(...r.avertissements.map((a) => `  ⚠ ${a}`));
    slides.push({ position: s.position, jpeg_base64: r.jpeg.toString("base64"), ...(s.position === t.app.position ? { position_app: true as const } : {}) });
  }
  decks[langue] = { hashtags: t.legendes[langue]!, slides };
}
if (!decks[LANGUE_SOURCE]) throw new Error(`pas de deck en ${LANGUE_SOURCE} (langue source) : rien déposé`);

const corps = {
  action: "deposer",
  pod: POD,
  source_url: post.url,
  source_id: id,
  source_vues: post.vues,
  titre: t.titre.slice(0, 160),
  langue_source: LANGUE_SOURCE,
  musique_url: post.musique.url,
  musique_titre: post.musique.titre,
  // L'accroche d'abord : la note de pertinence de l'OS la lit comme le hook.
  textes: [t.titre, ...textesAnglais(t)],
  decks,
};

if (essai) {
  mkdirSync(essai, { recursive: true });
  writeFileSync(join(essai, `${id}.depot.json`), JSON.stringify(corps));
  bilan.push(`${id} : écrit dans ${essai} (${Object.keys(decks).join(",")})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  post.statut = "depose";
  post.motif = `livraison ${r.id}`;
  ecrireManifeste(manifeste);
  bilan.push(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(",")} · applications ${JSON.stringify(r.applications)}`);
}
console.log(bilan.join("\n"));
