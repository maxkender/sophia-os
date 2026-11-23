// Les polices du compte, calées sur ses slides (relevé du 15/11) et
// enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres (« GÉRER / SON ARGENT »), la couverture et la ligne du temps (« 1 heure pour apprendre ») : Anton. */
  titre: "SG Titre",
  /** La carte YouTube (appli iOS, mode sombre) : Inter Medium pour le titre de la vidéo… */
  youtube: "SG YouTube",
  /** … Inter Regular pour la chaîne, les vues et la date… */
  youtubeMeta: "SG YouTube Meta",
  /** … et Roboto Medium pour la durée posée sur la miniature. */
  duree: "SG Durée",
  /** Le texte de la carte Sophia : Inter Medium. */
  texte: "SG Texte",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Anton-Regular.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Medium.ttf"), POLICE.youtube);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Regular.otf"), POLICE.youtubeMeta);
GlobalFonts.registerFromPath(join(DOSSIER, "Roboto-Medium.ttf"), POLICE.duree);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Medium.ttf"), POLICE.texte);

/**
 * Anton n'a ni le grec ni le cyrillique : un deck grec prend Fira Sans Extra
 * Condensed Black pour tous ses titres (couverture, étapes, temps). Le serbe
 * s'écrit en latin (l'usage de TikTok) et garde Anton. Choisie par slide,
 * dans `rendreSlide`, selon la langue du deck.
 */
GlobalFonts.registerFromPath(join(DOSSIER, "FiraSansExtraCondensed-Black.ttf"), "SG Titre Grec");
const TITRE_PAR_LANGUE: Record<string, string> = { el: "SG Titre Grec" };
let titreActif: string = POLICE.titre;
/** La police des titres du deck en cours de rendu. */
export const policeTitre = () => titreActif;
export function choisirPoliceTitre(langue: string) {
  titreActif = TITRE_PAR_LANGUE[langue] ?? POLICE.titre;
}

/**
 * Les emojis d'un titre de vidéo : l'appli les affiche en couleur. Noto Color
 * Emoji de la machine, en secours des polices de la carte YouTube.
 */
const EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";
export const POLICE_EMOJI = existsSync(EMOJI) && GlobalFonts.registerFromPath(EMOJI, "SG Emoji") ? ', "SG Emoji"' : "";
