// Les polices du compte modèle (@msclzz), calées sur ses slides (relevé du
// 27/11) : les titres en Manrope Bold (largeur et hauteur des capitales
// mesurées : 62 px sur ses 1170 px), le texte en Golos Text SemiBold
// (45 px). Les deux sous SIL OFL (polices/OFL-*.txt), enregistrées sous des
// noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres (« WHY SOME PEOPLE DISAPPEAR FAST ») et la couverture. */
  titre: "MC Titre",
  /** Les paragraphes. */
  texte: "MC Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Manrope-Bold.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "GolosText-SemiBold.ttf"), POLICE.texte);
