// Usage : POD_JETON=… node atelier/cli-deposer.ts <source_id|all> [--essai]
// BLEO : un original qui déclare "type_bleo" (et "parent_contenu_id" pour une
// déclinaison, voir npm run boite) part sans schéma ni preuve.
// Dépose un ou tous les originaux (originaux/<id>.json) dans la file de
// validation de l'OS, AVEC LA PREUVE de leur schéma d'accroche (playbook.json,
// `schema_id`). Sans preuve valable aujourd'hui (post de la niche ≥ 200 k vues
// en 30 jours, ou contenu du label à r ≥ 2), rien ne part : refais la veille.
// L'OS recontrôle la preuve et recalcule le r des contenus du label.
// Un original en attente est remplacé ; un original déjà validé ou rejeté est
// refusé par l'OS (créer un nouvel id). Préfixes d'images (8 car.) résolus.
// --essai : contrôles locaux seulement, rien n'est envoyé.
import { readdirSync, readFileSync } from "node:fs";
import { appelPod, declarationBleo, preuveDuSchema, type Original, type Playbook } from "./api.ts";

const [cible] = process.argv.slice(2);
if (!cible) throw new Error("usage : deposer <source_id|all> [--essai]");
const essai = process.argv.includes("--essai");
const playbook = JSON.parse(readFileSync("playbook.json", "utf8")) as Playbook;
const r = await appelPod<{ images: { id: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
// Reprises (ROUTINE.md §4.7, 28/10) : reprendre une accroche ou une couverture
// est permis, c'est le principe des variantes. Seule interdiction : deux posts
// identiques. Une reprise doit changer au moins les items, l'angle, une image
// ou le CTA ; un original dont toutes les slides (texte, image, texte Sophia)
// sont celles d'un autre est refusé.
const tous = readdirSync("originaux")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original);
const empreinte = (o: Original) =>
  JSON.stringify(
    [...o.slides]
      .sort((a, b) => a.position - b.position)
      .map((s) => [s.media_id.slice(0, 8), s.texte_overlay.replace(/\s+/g, " ").trim().toLowerCase(), (s.texte_sophia ?? "").trim().toLowerCase()]),
  );
function doublonCouverture(o: Original): string | null {
  const meme = tous.find((x) => x.source_id !== o.source_id && empreinte(x) === empreinte(o));
  return meme ? `identique à ${meme.source_id} : change les items, l'angle, une image ou le CTA` : null;
}
const fichiers = readdirSync("originaux").filter((f) => f.endsWith(".json") && (cible === "all" || f === `${cible}.json`));
if (!fichiers.length) throw new Error(`aucun original « ${cible} »`);
for (const f of fichiers) {
  const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
  // BLEO (L4) : un original déclaré (type_bleo, voir npm run boite) part sans
  // schéma ni preuve ; l'OS le juge sur la boîte (famille, génération, quota, accroche).
  const bleo = declarationBleo(o);
  if ("erreur" in bleo) {
    console.log(`${o.source_id} : REFUSÉ ${bleo.erreur}`);
    continue;
  }
  const schema = bleo.type_bleo ? null : playbook.schemas.find((s) => s.id === o.schema_id);
  if (!bleo.type_bleo && !schema) {
    console.log(`${o.source_id} : REFUSÉ schéma « ${o.schema_id} » absent du playbook`);
    continue;
  }
  const doublon = doublonCouverture(o);
  if (doublon) {
    console.log(`${o.source_id} : REFUSÉ ${doublon}`);
    continue;
  }
  const preuve = schema ? preuveDuSchema(schema) : null;
  if (!bleo.type_bleo && !preuve) {
    console.log(`${o.source_id} : REFUSÉ schéma « ${o.schema_id} » expiré (aucune preuve de moins de 30 jours) : refais la veille`);
    continue;
  }
  const slides = o.slides.map((s) => {
    const im = r.images.find((i) => i.id === s.media_id || i.id.startsWith(s.media_id));
    if (!im) throw new Error(`${o.source_id} #${s.position} : image ${s.media_id} hors banque`);
    return {
      position: s.position,
      media_id: im.id,
      texte_overlay: s.texte_overlay,
      texte_sophia: s.texte_sophia ?? null,
      reference_url: s.reference_url,
    };
  });
  if (essai) {
    console.log(`${o.source_id} : ${slides.length} slides, ${bleo.type_bleo ? bleo.resume : `schéma « ${schema?.id} », ${preuve?.references.length ?? 0} référence(s) de preuve`}, prêt`);
    continue;
  }
  const d = await appelPod<{ id: string }>({
    action: "deposer",
    type: "original",
    source_id: o.source_id,
    titre: o.titre,
    langue_source: "en",
    musique_titre: o.musique_titre ?? null,
    musique_url: o.musique_url ?? null,
    inspirations: o.inspirations ?? [],
    ...(bleo.type_bleo ? bleo.champs : { preuve }),
    slides,
  });
  console.log(`${o.source_id} : ${d.ok ? `déposé (${d.id})` : `REFUSÉ ${d.error}`}`);
}
