// Usage : POD_JETON=… node atelier/cli-persona.ts <compte_id> <image.jpg|png> "<description>"
// Enregistre le persona synthétique d'un compte (portrait Soul 2 téléchargé
// en local). Il part en validation dans Pilotage → Pods ; tant qu'il n'est pas
// validé, le compte ne peut recevoir aucune vidéo. 1 compte = 1 persona :
// un persona validé ne se remplace pas.
import { appelPod, envoyer } from "./api.ts";

const [compteId, image, description] = process.argv.slice(2);
if (!compteId || !image || !description) throw new Error('usage : persona <compte_id> <image.jpg|png> "<description>"');
const ext = image.toLowerCase().endsWith(".png") ? "png" : "jpg";
const { chemin } = await envoyer(`personas/${compteId}.${ext}`, image);
const r = await appelPod<{ id: string }>({ action: "persona", compte_id: compteId, image_path: chemin, description });
if (!r.ok) throw new Error(r.error);
console.log(`persona ${r.id} enregistré, à valider dans Pilotage → Pods`);
