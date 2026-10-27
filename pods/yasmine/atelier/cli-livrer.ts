// Usage : npm run livrer -- <id> [--langues fr] [--essai <dossier>]
//
// Rend le remake posts/<id>.json dans chaque langue écrite et le DÉPOSE dans
// la file de validation de l'OS (fonction Edge `pods`, action `deposer`).
// Rien n'est diffusé avant validation (à la main, ou toute seule 12 h après).
//
// Le label du pod (that_girl_study) ne sert que micabo : un deck par langue,
// la slide de l'appli marquée `position_app` (une seule, jamais la
// couverture) ; l'OS en tire la variante micabo, note la pertinence avec le
// prompt micabo et la note d'import avec les vues du post refait.
//
// Environnement : POD_JETON. --essai écrit le corps de la requête sur disque
// au lieu de l'envoyer.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appelPod, LANGUE_SOURCE, LANGUES, POD } from "./api.ts";
import { metadonneesRestantes } from "./metadonnees.ts";
import { chargerFond, type ContenuSlide, contenu, languesCompletes, lirePost, RACINE, rendreSlide } from "./slides.ts";

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error("usage : npm run livrer -- <id> [--langues fr] [--essai <dossier>]");
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const essai = opt("--essai");

const post = lirePost(id);
const completes = languesCompletes(post);
const langues = (opt("--langues")?.split(",") ?? [...LANGUES]).filter((l) => completes.includes(l));
// Le deck source doit être complet ; avec --langues, un redépôt peut n'apporter que d'autres langues
// (la fonction refuse plus de ~5 langues d'un coup : WORKER_LIMIT, HTTP 546).
if (!completes.includes(LANGUE_SOURCE)) throw new Error(`${id} : le deck ${LANGUE_SOURCE} n'est pas complet (titre, légende et chaque slide)`);
if (!langues.length) throw new Error(`${id} : aucune langue complète à déposer`);
const apps = post.slides.flatMap((s, i) => (s.app ? [i] : []));
if (apps.length !== 1 || apps[0] === 0) throw new Error(`${id} : une seule slide de l'appli, jamais la couverture (trouvé : ${apps.map((i) => i + 1).join(", ") || "aucune"})`);

const photo = await chargerFond(post);
const decks: Record<string, { hashtags: string; slides: { position: number; jpeg_base64: string; position_app?: true }[] }> = {};
for (const langue of langues) {
  const slides = [];
  for (const [i, s] of post.slides.entries()) {
    const jpeg = await rendreSlide(post, s, langue, photo);
    const restes = metadonneesRestantes(jpeg);
    if (restes.length) throw new Error(`${langue} #${i + 1} : métadonnées ${restes.join(", ")}`);
    slides.push({ position: i + 1, jpeg_base64: jpeg.toString("base64"), ...(s.app ? { position_app: true as const } : {}) });
  }
  decks[langue] = { hashtags: post.legendes[langue], slides };
}

// Les textes lus par la note de pertinence : l'accroche d'abord, puis les légendes des slides.
const s0 = contenu(post.slides[0], LANGUE_SOURCE).couverture;
const accroche = [s0?.script_haut, ...(s0?.lignes ?? []), s0?.script_bas, s0?.texte_bas].filter(Boolean).join(" ");
const textes = [
  accroche,
  ...post.slides.slice(1).map((s) => {
    const c = contenu(s, LANGUE_SOURCE);
    const photo = [c.legende, c.legende_bas].flatMap((l) => (l ? [...l.lignes, ...(l.sous ?? [])] : []));
    const note = [...(c.note ? [c.note] : []), ...(c.notes ?? [])].flatMap((n) => [n.titre ?? "", n.texte ?? ""]).filter(Boolean);
    const carteTexte = c.carte ? [c.carte.nom, ...c.carte.lignes.filter(Boolean)] : [];
    return [...(c.haut ?? []), ...photo, ...note, ...carteTexte, ...(c.bas ?? [])].join(" ");
  }),
].filter(Boolean);

const corps = {
  action: "deposer",
  pod: POD,
  source_url: post.source.url,
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
  console.log(`${id} : écrit dans ${essai} (${Object.keys(decks).join(", ")}, slide de l'appli #${apps[0] + 1})`);
} else {
  const r = await appelPod<{ id?: string; langues?: string[]; applications?: Record<string, string[]> }>(corps);
  if (!r.ok) throw new Error(`${id} : dépôt refusé : ${r.error}`);
  console.log(`${id} : déposé (livraison ${r.id}) · langues ${r.langues?.join(", ")} · applications ${JSON.stringify(r.applications)}`);
  // Les mises en scène de l'OS utilisées dans ce post : leur compteur d'usage monte d'un cran,
  // une seule fois par post (un redépôt ne recompte pas : posts/<id>.json garde la liste).
  const notees = new Set(post.mises_en_scene_notees ?? []);
  const photos = post.slides.flatMap((s) => [
    s.photo,
    s.photo_bas,
    ...langues.flatMap((l) => (typeof s[l] === "object" ? [(s[l] as ContenuSlide).photo, (s[l] as ContenuSlide).photo_bas] : [])),
  ]);
  for (const m of new Set(photos.flatMap((p) => (p?.mise_en_scene ? [p.mise_en_scene] : [])))) {
    if (notees.has(m)) {
      console.log(`  mise en scène ${m.slice(0, 8)} : usage déjà noté pour ce post`);
      continue;
    }
    const u = await appelPod({ action: "utiliser", id: m }, "mises-en-scene");
    console.log(`  mise en scène ${m.slice(0, 8)} : ${u.ok ? "usage noté" : `usage non noté (${u.error})`}`);
    if (u.ok) notees.add(m);
  }
  if (notees.size) {
    const brut = JSON.parse(readFileSync(join(RACINE, "posts", `${id}.json`), "utf8"));
    brut.mises_en_scene_notees = [...notees];
    writeFileSync(join(RACINE, "posts", `${id}.json`), `${JSON.stringify(brut, null, 1)}\n`);
  }
}
