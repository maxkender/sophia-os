// Usage : node atelier/cli-livrer.ts [sources] <post_id|all> [--langues fr,de] [--essai <dossier>]
//                                    [--unswipe <dossier>]
//
// Rend un post (une version par langue dont la traduction existe :
// posts/<id>.<langue>.json) et le DÉPOSE dans la file de validation de l'OS
// (fonction Edge `pods`, action `deposer`). Rien n'est diffusé avant qu'un
// admin valide dans Pilotage → Pods.
//
// Environnement : POD_JETON (jeton de l'agent du pod), SUPABASE_URL (défaut :
// projet de prod). --essai écrit le corps de la requête sur disque au lieu
// de l'envoyer.
//
// --unswipe <dossier> : variante UnSwipe du deck (servie sur les seuls créneaux
// UnSwipe). Pour chaque langue rendue, si `<dossier>/<post_id>/unswipe/<langue>/`
// contient `<position>.jpg` (la slide de l'app, rendue à part), elle est déposée
// dans `decks_applications.unswipe.<langue>` ; les autres positions reprennent
// l'image Sophia (`reprendre: true`). Une seule image, à la position de la slide
// Sophia (c'est elle qu'elle remplace).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyserSlide } from "./geometrie.ts";
import { chargerRessources, rendreSlide, type Transcription } from "./rendu.ts";
import { metadonneesRestantes, retirerMetadonnees } from "./metadonnees.ts";

const POD = "page_blanche";
const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

type Manifeste = {
  posts: {
    post_id: string;
    url: string;
    vues: number | null;
    legende: string;
    statut: string;
    musique: { titre: string | null; url_tiktok: string | null };
  }[];
};

const args = process.argv.slice(2);
const [dossierSource, cible] = args;
const opt = (nom: string) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const langues = (opt("--langues") ?? "fr").split(",").map((l) => l.trim()).filter(Boolean);
const essai = opt("--essai");
const dossierUnswipe = opt("--unswipe");
const langueSource = langues[0];

const manifeste = JSON.parse(readFileSync("posts/manifeste.json", "utf8")) as Manifeste;
const posts = manifeste.posts.filter((p) => p.statut !== "exclu" && (cible === "all" || p.post_id === cible));
if (!posts.length) throw new Error(`aucun post pour « ${cible} »`);

/** Texte lisible d'une slide (blocs dans l'ordre, sans marqueurs de soulignement). */
function texteSlide(t: Transcription): string {
  return Object.values(t.textes)
    .filter((b) => !b.garder)
    .map((b) => (b.texte ?? b.fr).replace(/\[\[|\]\]/g, "").trim())
    .filter(Boolean)
    .join(" ");
}

const estSlideApp = (t: Transcription) =>
  Object.values(t.images ?? {}).some((a) => a.startsWith("sophia_")) || (t.zones ?? []).length > 0;

type SlideApp = { position: number; reprendre?: true; position_app?: true; jpeg_base64?: string };

/**
 * Variante UnSwipe d'un deck rendu : l'image de `<dossier>/<id>/unswipe/<langue>/`
 * pour la slide de l'app, `reprendre` pour les autres. `null` si rien à déposer.
 */
function deckUnswipe(
  postId: string,
  langue: string,
  slides: { position: number; position_sophia: boolean }[],
): { slides: SlideApp[] } | string | null {
  if (!dossierUnswipe) return null;
  const dossier = join(dossierUnswipe, postId, "unswipe", langue);
  if (!existsSync(dossier)) return null;
  const images = readdirSync(dossier).filter((f) => /^\d+\.jpg$/.test(f));
  const sophia = slides.filter((s) => s.position_sophia).map((s) => s.position);
  const position = images.length === 1 ? Number(images[0].replace(".jpg", "")) : null;
  if (position === null || sophia.length !== 1 || sophia[0] !== position) {
    return `une image attendue dans ${dossier}, à la position de la slide Sophia (${sophia.join(",")})`;
  }
  const propre = retirerMetadonnees(readFileSync(join(dossier, images[0])));
  if (metadonneesRestantes(propre).length) return `${dossier}/${images[0]} : métadonnées restantes`;
  return {
    slides: slides.map((s) =>
      s.position === position
        ? { position: s.position, position_app: true as const, jpeg_base64: propre.toString("base64") }
        : { position: s.position, reprendre: true as const }
    ),
  };
}

const bilan: string[] = [];
for (const p of posts) {
  const variante = [...p.post_id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const decks: Record<string, { hashtags: string; slides: { position: number; position_sophia: boolean; jpeg_base64: string }[] }> = {};
  const unswipe: Record<string, { hashtags: string; slides: SlideApp[] }> = {};
  let textes: string[] = [];

  for (const langue of langues) {
    const fichier = `posts/${p.post_id}.${langue}.json`;
    if (!existsSync(fichier)) continue;
    const tr = JSON.parse(readFileSync(fichier, "utf8")) as { slides: Record<string, Transcription> };
    const ressources = await chargerRessources(langue);
    const slides = [];
    const textesLangue: string[] = [];
    for (const [num, t] of Object.entries(tr.slides).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const source = join(dossierSource, `${p.post_id}_${num}.jpg`);
      const geo = await analyserSlide(source);
      const { jpeg, rapport } = await rendreSlide(source, geo, t, { ressources, variante });
      if (rapport.avertissements.length) bilan.push(`${p.post_id} ${langue} #${num} : ${rapport.avertissements.join(" ; ")}`);
      const propre = retirerMetadonnees(jpeg);
      if (metadonneesRestantes(propre).length) throw new Error(`${p.post_id} #${num} : métadonnées restantes`);
      slides.push({ position: Number(num), position_sophia: estSlideApp(t), jpeg_base64: propre.toString("base64") });
      textesLangue.push(texteSlide(t));
    }
    decks[langue] = { hashtags: p.legende, slides };
    const deckApp = deckUnswipe(p.post_id, langue, slides);
    if (typeof deckApp === "string") bilan.push(`${p.post_id} ${langue} : unswipe ignoré (${deckApp})`);
    else if (deckApp) unswipe[langue] = { hashtags: p.legende, slides: deckApp.slides };
    if (langue === langueSource) textes = textesLangue;
  }

  if (!decks[langueSource]) {
    bilan.push(`${p.post_id} : pas de traduction en ${langueSource}, ignoré`);
    continue;
  }
  if (!decks[langueSource].slides.some((s) => s.position_sophia)) {
    bilan.push(`${p.post_id} : aucune slide de l'app (rien à promouvoir), ignoré`);
    continue;
  }

  const corps = {
    action: "deposer",
    pod: POD,
    source_url: p.url || null,
    source_id: p.post_id,
    // Post original : pas de vues source (null, et non 0).
    source_vues: p.vues ?? undefined,
    titre: textes[0]?.slice(0, 160) ?? null,
    langue_source: langueSource,
    musique_url: p.musique.url_tiktok,
    musique_titre: p.musique.titre,
    textes,
    decks,
    ...(Object.keys(unswipe).length ? { decks_applications: { unswipe } } : {}),
  };

  if (essai) {
    mkdirSync(essai, { recursive: true });
    writeFileSync(join(essai, `${p.post_id}.depot.json`), JSON.stringify(corps));
    const app = Object.keys(unswipe).length ? ` + unswipe ${Object.keys(unswipe).join(",")}` : "";
    bilan.push(`${p.post_id} : écrit (${Object.keys(decks).join(",")}${app})`);
    continue;
  }

  const jeton = process.env.POD_JETON;
  if (!jeton) throw new Error("POD_JETON manquant");
  const reponse = await fetch(`${process.env.SUPABASE_URL ?? URL_DEFAUT}/functions/v1/pods`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pod-jeton": jeton },
    body: JSON.stringify(corps),
  });
  const r = (await reponse.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
  bilan.push(`${p.post_id} : ${reponse.status} ${r.ok ? `déposé (${r.id})` : r.error}`);
}

console.log(bilan.join("\n"));
