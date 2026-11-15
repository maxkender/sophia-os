// Les polices du compte, calées sur ses slides (relevé du 4/11) et
// enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres géants (« HOW TO / SMALL TALK ») et la couverture (« 10/10 SKILLS… ») : Anton. */
  titre: "KA Titre",
  /** La carte YouTube (appli iOS) : Inter Bold pour le titre de la vidéo… */
  youtube: "KA YouTube",
  /** … Inter Regular pour la chaîne, les vues et la date… */
  youtubeMeta: "KA YouTube Meta",
  /** … et Roboto Medium pour la durée posée sur la miniature. */
  duree: "KA Durée",
  /** Le texte de la carte Sophia : Inter Medium. */
  texte: "KA Texte",
  /** La ligne du temps sous la carte (« 10-30 min ») : Inter SemiBold. */
  sous: "KA Sous",
  /** Le titre en bandeau d'une étape (réserve, repris du podz 11) : Inter Black. */
  bandeau: "KA Bandeau",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Anton-Regular.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Bold.otf"), POLICE.youtube);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Regular.otf"), POLICE.youtubeMeta);
GlobalFonts.registerFromPath(join(DOSSIER, "Roboto-Medium.ttf"), POLICE.duree);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Medium.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-SemiBold.ttf"), POLICE.sous);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Black.ttf"), POLICE.bandeau);

/**
 * Les emojis d'un titre de vidéo : l'appli les affiche en couleur. Noto Color
 * Emoji de la machine, en secours des polices de la carte YouTube.
 */
const EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";
export const POLICE_EMOJI = existsSync(EMOJI) && GlobalFonts.registerFromPath(EMOJI, "KA Emoji") ? ', "KA Emoji"' : "";
