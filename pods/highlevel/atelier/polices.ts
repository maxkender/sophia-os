// Les polices du compte modèle (@highlevelgame_), calées sur ses slides (relevé
// du 25/11) : un serif ancien bordeaux, au plus près Vollkorn (SIL OFL,
// polices/OFL-Vollkorn.txt) : Regular pour le texte, SemiBold pour les titres
// de conseil et ses mots en gras, Medium pour la couverture en capitales. Sa
// main « swipe » : Noto Emoji (SIL OFL, polices/OFL-NotoEmoji.txt). Enregistrées
// sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  texte: "HL Texte",
  gras: "HL Gras",
  titre: "HL Titre",
  emoji: "HL Emoji",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Vollkorn-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "Vollkorn-SemiBold.ttf"), POLICE.gras);
GlobalFonts.registerFromPath(join(DOSSIER, "Vollkorn-Medium.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "NotoEmoji.ttf"), POLICE.emoji);
