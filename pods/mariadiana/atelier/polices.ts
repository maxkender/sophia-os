// La police du compte modèle (@mariadianatudor), calée sur ses slides (relevé
// du 25/11) : TikTok Sans, la police du texte de TikTok (Medium pour les titres
// d'œuvre, l'artiste et la couverture ; Regular pour le paragraphe). SIL OFL
// (polices/OFL-TikTokSans.txt), enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Le paragraphe à droite du tableau. */
  texte: "MD Texte",
  /** Le titre de l'œuvre, l'artiste, le titre de couverture. */
  titre: "MD Titre",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-Medium.ttf"), POLICE.titre);
