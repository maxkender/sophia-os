// Les polices du compte modèle (@built.not.born61, ses gabarits Canva), calées
// sur ses slides (relevé du 19/11) et enregistrées sous des noms à nous.
// Fichiers statiques officiels de Google Fonts, SIL OFL (polices/OFL-*.txt),
// jamais modifiés (IBM Plex a un nom réservé : on ne le retouche pas).

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres (« 6 WAYS TO BECOME… », « 2. Have a bright smile ») : League Spartan Bold, un peu resserrée. */
  titre: "BN Titre",
  /** Le texte sous le titre : IBM Plex Sans Regular (largeurs identiques aux siennes au pixel). */
  texte: "BN Texte",
  /** « Follow for more » : Arimo Regular (la linéale par défaut de Canva). */
  fin: "BN Fin",
  /** Le grec des titres (League Spartan n'a pas de grec) : Manrope ExtraBold, géométrique, pris glyphe par glyphe en repli. */
  titreGrec: "BN Titre Grec",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "LeagueSpartan-Bold.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "IBMPlexSans-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "Arimo-Regular.ttf"), POLICE.fin);
GlobalFonts.registerFromPath(join(DOSSIER, "Manrope-ExtraBold.ttf"), POLICE.titreGrec);
