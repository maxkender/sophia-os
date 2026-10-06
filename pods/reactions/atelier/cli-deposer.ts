// Usage : POD_JETON=… node atelier/cli-deposer.ts <source_id>
// Envoie les réactions animées (sortie/<source_id>/<compte>.mp4) vers
// reactions/<source_id>/<compte>.mp4 et dépose la livraison vidéo dans la file
// de validation (Pilotage → Pods). Une livraison en attente est remplacée.
// L'OS ajoute la démo Sophia de la langue et pose la date à la validation.
import { existsSync } from "node:fs";
import { appelPod, envoyer, lireLivraison } from "./api.ts";

const sourceId = process.argv[2];
if (!sourceId) throw new Error("usage : deposer <source_id>");
const l = lireLivraison(sourceId);
const items = [];
for (const c of l.comptes) {
  const mp4 = `sortie/${sourceId}/${c.compte_id}.mp4`;
  if (!existsSync(mp4)) throw new Error(`${mp4} absent : lancer animer d'abord`);
  const { chemin } = await envoyer(`reactions/${sourceId}/${c.compte_id}.mp4`, mp4);
  items.push({ compte_id: c.compte_id, reaction_path: chemin, texte_ecran: c.texte_ecran, legende: c.legende });
}
const r = await appelPod<{ id: string }>({
  action: "deposer",
  type: "video",
  source_id: sourceId,
  source_url: l.source_url,
  source_vues: l.source_vues,
  titre: l.titre,
  texte_source: l.texte_source,
  musique_titre: l.musique_titre ?? null,
  musique_url: l.musique_url ?? null,
  items,
});
if (!r.ok) throw new Error(r.error);
console.log(`livraison ${r.id} déposée : ${items.length} compte(s), à valider dans Pilotage → Pods`);
