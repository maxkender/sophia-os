// Les polices du compte modèle (@charl.focus), calées sur ses slides (relevé
// du 24/11) : Montserrat partout (SIL OFL, polices/OFL-Montserrat.txt), Light
// pour le texte, Regular pour les titres, SemiBold pour ses mots forts, Bold
// pour le mot clé de la couverture. Enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Le texte des points, la note de couverture. */
  leger: "CF Texte",
  /** « 1 · nada te motiva. », « cómo arreglar tu ». */
  titre: "CF Titre",
  /** Ses mots forts dans le texte (**gras**). */
  gras: "CF Gras",
  /** Le mot clé de la couverture (« DOPAMINA »). */
  fort: "CF Fort",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Montserrat-Light.ttf"), POLICE.leger);
GlobalFonts.registerFromPath(join(DOSSIER, "Montserrat-Regular.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Montserrat-SemiBold.ttf"), POLICE.gras);
GlobalFonts.registerFromPath(join(DOSSIER, "Montserrat-Bold.ttf"), POLICE.fort);
