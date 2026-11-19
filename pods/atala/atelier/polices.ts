// Les polices des comptes modèles (@hannah.run5, @katrina.run : le même
// gabarit Canva), calées sur leurs slides (relevé du 19/11) et enregistrées
// sous des noms à nous. Fichiers statiques officiels de Google Fonts, SIL OFL
// (polices/OFL-*.txt). Red Hat Mono n'a pas de cyrillique : en bulgare ou en
// russe, il faudra une autre police de légendes.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres (« la tenue », « first 5k / do and don’ts ») : Playfair Display Regular. */
  titre: "AT Titre",
  /** Le mot appuyé d'un titre (« running girl », « à éviter ») : Playfair Display ExtraBold Italic. */
  appui: "AT Appui",
  /** Les légendes sous les vignettes, « Do ✓ » et « Don’t ✕ » : Red Hat Mono SemiBold. */
  legende: "AT Legende",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "PlayfairDisplay-Regular.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "PlayfairDisplay-ExtraBoldItalic.ttf"), POLICE.appui);
GlobalFonts.registerFromPath(join(DOSSIER, "RedHatMono-SemiBold.ttf"), POLICE.legende);
