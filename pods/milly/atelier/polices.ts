// La police du compte modèle (@bdnf.milly), calée au pixel sur ses slides
// (relevé du 19/11) : Cormorant Garamond Regular partout (titres, couverture,
// texte). Fichiers statiques officiels de Google Fonts, SIL OFL
// (polices/OFL-CormorantGaramond.txt, sans nom réservé), enregistrés sous un
// nom à nous. Medium et SemiBold sont là si un post les demande un jour.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Tout le texte des slides. */
  texte: "MI Texte",
  medium: "MI Medium",
  gras: "MI Gras",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "CormorantGaramond-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "CormorantGaramond-Medium.ttf"), POLICE.medium);
GlobalFonts.registerFromPath(join(DOSSIER, "CormorantGaramond-SemiBold.ttf"), POLICE.gras);
