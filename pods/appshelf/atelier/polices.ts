// Les polices du compte, calées sur ses slides (relevé du 15/11) et
// enregistrées sous des noms à nous. Inter (SIL OFL, polices/Inter-LICENSE.txt),
// Playfair Display (SIL OFL, polices/PlayfairDisplay-OFL.txt).

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Le titre de la couverture et « save & follow » : Inter Display SemiBold, serré. */
  titre: "AS Titre",
  /** Le mot en italique de la couverture (« most ») : Playfair Display Italic. */
  script: "AS Script",
  /** Le nom de l'appli : Inter Display Medium, serré. */
  nom: "AS Nom",
  /** Pastilles, note, appareil photo : Inter Regular. */
  texte: "AS Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "InterDisplay-SemiBold.otf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "PlayfairDisplay-Italic.ttf"), POLICE.script);
GlobalFonts.registerFromPath(join(DOSSIER, "InterDisplay-Medium.otf"), POLICE.nom);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Regular.otf"), POLICE.texte);
