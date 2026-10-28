// Usage : POD_JETON=… node atelier/cli-deposer.ts <source_id|all> [--essai]
// Dépose un ou tous les originaux (originaux/<id>.json) dans la file de
// validation de l'OS, AVEC LA PREUVE de leur schéma d'accroche (playbook.json,
// `schema_id`). Sans preuve valable aujourd'hui (post de la niche ≥ 200 k vues
// en 30 jours, ou contenu du label à r ≥ 2), rien ne part : refais la veille.
// L'OS recontrôle la preuve et recalcule le r des contenus du label.
// Un original en attente est remplacé ; un original déjà validé ou rejeté est
// refusé par l'OS (créer un nouvel id). Préfixes d'images (8 car.) résolus.
// --essai : contrôles locaux seulement, rien n'est envoyé.
import { readdirSync, readFileSync } from "node:fs";
import { appelPod, preuveDuSchema, type Original, type Playbook } from "./api.ts";

const [cible] = process.argv.slice(2);
if (!cible) throw new Error("usage : deposer <source_id|all> [--essai]");
const essai = process.argv.includes("--essai");
const playbook = JSON.parse(readFileSync("playbook.json", "utf8")) as Playbook;
const r = await appelPod<{ images: { id: string }[] }>({ action: "images" });
if (!r.ok) throw new Error(r.error);
// Couvertures et accroches jamais réutilisées (règle du chef des podz, 28/10) :
// à partir d'ay-o048, la slide 1 (media_id ET reference_url) et l'accroche
// d'un original ne doivent apparaître dans aucun original précédent.
const DEPUIS_UNIQUE = 48;
const numero = (id: string) => Number(id.replace(/\D+/g, ""));
const tous = readdirSync("originaux")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original);
const accroche = (o: Original) => (o.slides.find((s) => s.position === 1)?.texte_overlay ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const couverture = (o: Original) => o.slides.find((s) => s.position === 1);
function doublonCouverture(o: Original): string | null {
  if (numero(o.source_id) < DEPUIS_UNIQUE) return null;
  const c = couverture(o);
  for (const autre of tous) {
    if (autre.source_id === o.source_id || numero(autre.source_id) >= numero(o.source_id)) continue;
    const a = couverture(autre);
    if (c && a && a.media_id.slice(0, 8) === c.media_id.slice(0, 8)) return `couverture ${c.media_id.slice(0, 8)} déjà prise par ${autre.source_id}`;
    if (c?.reference_url && a?.reference_url === c.reference_url) return `slide d'inspiration de couverture déjà prise par ${autre.source_id}`;
    if (accroche(autre) === accroche(o)) return `accroche identique à ${autre.source_id}`;
  }
  return null;
}
const fichiers = readdirSync("originaux").filter((f) => f.endsWith(".json") && (cible === "all" || f === `${cible}.json`));
if (!fichiers.length) throw new Error(`aucun original « ${cible} »`);
for (const f of fichiers) {
  const o = JSON.parse(readFileSync(`originaux/${f}`, "utf8")) as Original;
  const schema = playbook.schemas.find((s) => s.id === o.schema_id);
  if (!schema) {
    console.log(`${o.source_id} : REFUSÉ schéma « ${o.schema_id} » absent du playbook`);
    continue;
  }
  const doublon = doublonCouverture(o);
  if (doublon) {
    console.log(`${o.source_id} : REFUSÉ ${doublon} (npm run couvertures pour en trouver une neuve)`);
    continue;
  }
  const preuve = preuveDuSchema(schema);
  if (!preuve) {
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
    console.log(`${o.source_id} : ${slides.length} slides, schéma « ${schema.id} », ${preuve.references.length} référence(s) de preuve, prêt`);
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
    preuve,
    slides,
  });
  console.log(`${o.source_id} : ${d.ok ? `déposé (${d.id})` : `REFUSÉ ${d.error}`}`);
}
