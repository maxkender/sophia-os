// La police du compte modèle (@scilla2047), calée sur ses slides (relevé du
// 27/11) : le texte natif de TikTok, TikTok Sans (SIL OFL,
// polices/OFL-TikTokSans.txt) : les titres en Medium (66 px sur 1080), le
// paragraphe en SemiBold (40 px). Enregistrée sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** La couverture et les titres (« If authority makes you very angry »). */
  titre: "SC Titre",
  /** Le paragraphe en couleur. */
  texte: "SC Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-Medium.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-SemiBold.ttf"), POLICE.texte);
