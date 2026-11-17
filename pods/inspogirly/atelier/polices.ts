// La police du compte : le texte natif de TikTok (style « Classic »), soit
// TikTok Sans en SemiBold, taille optique 36, calée sur ses slides (relevé du
// 16/11 : « you can upload photos of your » fait 712 px d'encre en 53 px).
// TikTok Sans (SIL OFL, polices/TikTokSans-LICENSE.txt, sans nom réservé) :
// instance statique tirée de la police variable de Google Fonts
// (opsz 36, wdth 100, wght 600, slnt 0), enregistrée sous un nom à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Tout le texte : titre de la couverture, nom de l'appli, phrase. */
  texte: "IG TikTok",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "TikTokSans-Opsz36-SemiBold.ttf"), POLICE.texte);
