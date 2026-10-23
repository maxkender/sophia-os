// Les polices du compte, calées sur ses slides (relevé du 23/10) et
// enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres géants (« QUIT AN ADDICTION ») et la couverture : Anton. */
  titre: "FA Titre",
  /** La carte YouTube : Roboto Medium pour le titre de la vidéo et la durée… */
  youtube: "FA YouTube",
  /** … Roboto Regular pour la chaîne, les vues et la date. */
  youtubeMeta: "FA YouTube Meta",
  /** Le texte des cartes d'appli et de la slide Sophia : Inter Medium. */
  texte: "FA Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Anton-Regular.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Roboto-Medium.ttf"), POLICE.youtube);
GlobalFonts.registerFromPath(join(DOSSIER, "Roboto-Regular.ttf"), POLICE.youtubeMeta);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Medium.ttf"), POLICE.texte);
