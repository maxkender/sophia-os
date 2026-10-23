// Les polices du compte, calées sur ses slides (relevé du 23/10, planches
// de comparaison) et enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Le titre jaune de la couverture (« HOW I TAKE NOTES ») : Inter Black. */
  titre: "YP Titre",
  /** Les légendes jaunes au-dessus et au-dessous de l'appareil : Poppins Medium. */
  legende: "YP Legende",
  /** L'écriture fine de la couverture (« for each subject ») : Nothing You Could Do. */
  script: "YP Script",
  /** Les textes des modèles de notes (« HEADING », « Topic 1 ») : Inter Medium. */
  modele: "YP Modele",
  /** L'écriture des notes remplies, façon GoodNotes : Gochi Hand. */
  main: "YP Main",
  /** Le texte natif de TikTok des slides photo (« make a snack🥨 ») : TikTok Sans SemiBold. */
  tiktok: "YP TikTok",
  /** Les emojis de ces légendes, en couleur. */
  emoji: "YP Emoji",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Black.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Poppins-Medium.ttf"), POLICE.legende);
GlobalFonts.registerFromPath(join(DOSSIER, "NothingYouCouldDo.ttf"), POLICE.script);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Medium.ttf"), POLICE.modele);
GlobalFonts.registerFromPath(join(DOSSIER, "GochiHand.ttf"), POLICE.main);
GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-SemiBold.ttf"), POLICE.tiktok);

// Noto Color Emoji (OFL) : celle du système, 10 Mo, trop lourde pour le dépôt.
const EMOJI = ["/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", "/usr/share/fonts/noto/NotoColorEmoji.ttf"].find((f) => existsSync(f));
/** Les emojis se dessinent-ils ? Sinon, une légende qui en a refuse de se rendre. */
export const EMOJIS = Boolean(EMOJI && GlobalFonts.registerFromPath(EMOJI, POLICE.emoji));
