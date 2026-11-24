// Les polices des comptes modèles (@hannah.run5, @katrina.run : le même
// gabarit Canva), calées sur leurs slides (relevé du 19/11) et enregistrées
// sous des noms à nous. Fichiers statiques officiels de Google Fonts, SIL OFL
// (polices/OFL-*.txt). Ni Playfair ni Red Hat Mono n'ont le grec : chaque
// famille a donc une police de secours grecque (validée par Adrien le 24/11),
// qui ne sert qu'aux lettres que la première n'a pas (`FAMILLE`) : Noto Serif
// Display Regular (titres, une didone comme Playfair), Noto Serif Display
// ExtraBold Italic (mot appuyé), Fira Mono Medium (légendes : une légende
// grecque passe tout entière en Fira Mono, voir slides.ts). Pas de cyrillique : en bulgare ou
// en russe, il faudra d'autres polices.

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
GlobalFonts.registerFromPath(join(DOSSIER, "NotoSerifDisplay-Regular.ttf"), "AT Titre Grec");
GlobalFonts.registerFromPath(join(DOSSIER, "NotoSerifDisplay-ExtraBoldItalic.ttf"), "AT Appui Grec");
GlobalFonts.registerFromPath(join(DOSSIER, "FiraMono-Medium.ttf"), "AT Legende Grec");

/** Les familles à donner à `ctx.font` : la police du gabarit, puis sa police de secours grecque. */
export const FAMILLE = {
  titre: `"${POLICE.titre}", "AT Titre Grec"`,
  appui: `"${POLICE.appui}", "AT Appui Grec"`,
  legende: `"${POLICE.legende}", "AT Legende Grec"`,
  /** Une légende grecque, tout entière en Fira Mono Medium. */
  legendeGrec: `"AT Legende Grec"`,
} as const;
