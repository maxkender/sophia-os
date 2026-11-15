// Usage : POD_JETON=… node atelier/cli-ajouter.ts <image.jpg> "<légende en anglais>"
//
// Ajoute une image à la banque du label (action `ajouter_image` de l'OS) :
// typiquement une image Seedream (npm run seedream), REGARDÉE et retenue. L'OS
// la range avec les images propres du label ; elle se dépose ensuite comme les
// autres (son id : npm run images -- --cherche "<mots de la légende>").
//   - un JPEG vertical (9:16), sans métadonnées : npm run seedream le produit tel quel ;
//   - la légende décrit l'image en anglais (« a giant red oni watching a tiny
//     samurai on a red plain, empty blue sky ») : c'est elle que --cherche lit ;
//   - au plus 40 images par jour.
import { readFileSync } from "node:fs";
import { appelPod } from "./api.ts";

const [fichier, legende] = process.argv.slice(2);
if (!fichier || !legende) throw new Error('usage : ajouter <image.jpg> "<légende en anglais>"');
const octets = readFileSync(fichier);
const r = await appelPod<{ id: string; url: string }>({ action: "ajouter_image", jpeg_base64: octets.toString("base64"), legende });
if (!r.ok) throw new Error(`${fichier} : REFUSÉ ${r.error}`);
console.log(`${fichier} : dans la banque (${r.id.slice(0, 8)}) ${r.url}`);
