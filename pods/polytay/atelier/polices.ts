// Les polices du compte modèle (@polytay), calées sur ses slides (relevé du
// 20/11) : TikTok Sans, la police du texte de TikTok (Regular pour les
// paragraphes, Medium pour les titres et la couverture). SIL OFL
// (polices/OFL-TikTokSans.txt), enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les paragraphes, « save & follow ». */
  texte: "PT Texte",
  /** « 1. reading with a pen », le titre de couverture, « thank you for watching ». */
  titre: "PT Titre",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-Medium.ttf"), POLICE.titre);
