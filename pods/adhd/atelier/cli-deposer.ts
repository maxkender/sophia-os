// Usage : POD_JETON=… node atelier/cli-deposer.ts <source_id|all> [--essai]
// Dépose un ou tous les originaux (originaux/<id>.json) dans la file de
// validation de l'OS. Chaque original déclare "type_bleo" (« full_test », ou
// « declinaison » avec "parent_contenu_id", voir npm run boite).
// Contrôles locaux : 4 à 10 slides, une image différente de la banque du label
// par slide, l'accroche en 120 caractères au plus et les autres slides en 320,
// la slide TikTok d'inspiration de chaque position, AUCUNE appli dans le texte
// (l'OS place Artura lui-même), ni le compte modèle, ni un @.
// L'OS recontrôle tout. Un original en attente est remplacé ; un original déjà
// validé ou rejeté est refusé (créer un nouvel id). Préfixes d'images (8 car.) résolus.
// --essai : contrôles locaux seulement, rien n'est envoyé.
import { readdirSync, readFileSync } from "node:fs";
import { appelPod, declarationBleo, LANGUE_SOURCE, type Original } from "./api.ts";

// Les applis : les nôtres (l'OS place Artura, le texte n'en cite aucune) et celles de la niche.
const APPLI = /\b(sophia|artura|atala|micabo|unswipe|plony|fathomly|kaja|sagace|tweep|tiimo|finch|todoist|daily\s?art|smartify|artsy|google\s+arts|app|application|appli|download|link in bio)\b/i;
const LUI = /fraser|parkinson|tweep|@/i;
const PUB = /\b(ad|sponsored|sponsoris[ée]e?|code promo|promo code|lien en bio)\b/i;
// Jamais un médicament ni une dose (Ritalin, Adderall, Vyvanse, Concerta, Strattera, « meds »…) : pas de conseil médical.
const MEDICAL = /\b(ritalin|adderall|vyvanse|concerta|strattera|elvanse|methylphenidate|dexamfetamine|meds|medication|mg)\b/i;
const REFERENCE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/medias\/brut\//;

const [cible] = process.argv.slice(2);
if (!cible) throw new Error("usage : deposer <source_id|all> [--essai]");
const essai = process.argv.includes("--essai");
const r = await appelPod<{ images: { id: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
const fichiers = readdirSync("originaux").filter((f) => f.endsWith(".json") && (cible === "all" || f === `${cible}.json`));
if (!fichiers.length) throw new Error(`aucun original « ${cible} »`);
for (const f of fichiers) {
  const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
  const bleo = declarationBleo(o);
  if ("erreur" in bleo) {
    console.log(`${o.source_id} : REFUSÉ ${bleo.erreur}`);
    continue;
  }
  const erreurs: string[] = [];
  const deck = [...o.slides].sort((a, b) => a.position - b.position);
  if (deck.length < 4 || deck.length > 10) erreurs.push(`${deck.length} slides (4 à 10)`);
  if (deck.some((s, i) => s.position !== i + 1)) erreurs.push("positions 1, 2, 3… sans trou ni doublon");
  for (const t of [o.titre, ...deck.map((s) => s.texte_overlay)]) if (APPLI.test(t ?? "") || LUI.test(t ?? "") || PUB.test(t ?? "")) erreurs.push(`appli, compte modèle, @ ou pub : « ${(t ?? "").slice(0, 60)} »`);
  const slides = deck.map((s) => {
    const im = r.images.find((i) => i.id === s.media_id || i.id.startsWith(s.media_id));
    if (!im) erreurs.push(`#${s.position} : image ${s.media_id} hors banque du label`);
    const t = (s.texte_overlay ?? "").trim();
    const max = s.position === 1 ? 120 : 320;
    if (!t) erreurs.push(`#${s.position} : texte vide`);
    else if (t.length > max) erreurs.push(`#${s.position} : ${t.length} caractères (${max} au plus)`);
    if (MEDICAL.test(t)) erreurs.push(`#${s.position} : médicament ou dose : pas de conseil médical`);
    if (!REFERENCE.test(s.reference_url ?? "")) erreurs.push(`#${s.position} : slide d'inspiration manquante (medias/brut/…)`);
    return { position: s.position, media_id: im?.id ?? s.media_id, texte_overlay: t, reference_url: s.reference_url };
  });
  if (new Set(slides.map((s) => s.media_id)).size !== slides.length) erreurs.push("même image deux fois");
  if (erreurs.length) {
    console.log(`${o.source_id} : REFUSÉ ${erreurs.join(" · ")}`);
    continue;
  }
  if (essai) {
    console.log(`${o.source_id} : ${slides.length} slides, ${bleo.resume}, prêt`);
    continue;
  }
  const d = await appelPod<{ id: string }>({
    action: "deposer",
    type: "original",
    source_id: o.source_id,
    titre: o.titre,
    langue_source: o.langue_source ?? LANGUE_SOURCE,
    musique_titre: o.musique_titre ?? null,
    musique_url: o.musique_url ?? null,
    inspirations: o.inspirations ?? [],
    ...bleo.champs,
    slides,
  });
  console.log(`${o.source_id} : ${d.ok ? `déposé (${d.id})` : `REFUSÉ ${d.error}`}`);
}
