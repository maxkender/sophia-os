// La police du compte modèle (@traceygreen589), calée sur ses slides (relevé
// du 24/11) : de l'Arial, partout, en Regular. Arimo (SIL OFL,
// polices/OFL-Arimo.txt) a exactement ses métriques ; enregistrée sous un nom
// à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Tout le texte : titre, accroche, colonne, chute, couverture. */
  texte: "TG Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Arimo-Regular.ttf"), POLICE.texte);
