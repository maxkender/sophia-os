// La police du compte modèle (@healthy_with_emma6), calée sur ses slides
// (relevé du 19/11) : un Inter fin, entre Light et Regular. Inter (SIL OFL,
// polices/OFL-Inter.txt, sans nom réservé) : deux instances statiques tirées
// de la police variable de Google Fonts (opsz 14 ; wght 350 et 600),
// enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Tout le texte des slides : titres, intro, paragraphes, chute. */
  texte: "AW Texte",
  /** Le nom de l'appli sur sa carte et « the app: ». */
  gras: "AW Gras",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "InterNotes-Text.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "InterNotes-SemiBold.ttf"), POLICE.gras);
