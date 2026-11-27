// La police du compte modèle (@ssazem), calée sur ses slides (relevé du
// 27/11) : du Times New Roman, en Regular, tout en minuscules. Tinos (SIL OFL,
// polices/OFL-Tinos.txt) a les métriques de Times New Roman : mêmes largeurs,
// mêmes lignes. Enregistrée sous un nom à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Toute la phrase, ses deux blocs. */
  texte: "SZ Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Tinos-Regular.ttf"), POLICE.texte);
