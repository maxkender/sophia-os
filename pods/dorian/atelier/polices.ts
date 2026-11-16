// Les polices du compte, calées sur ses slides (relevé du 15/11) et
// enregistrées sous des noms à nous. Inter (SIL OFL, polices/Inter-LICENSE.txt).

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Les titres (« 5 niche ways to… », « Second-order thinking ») : Inter Display Light. */
  titre: "DR Titre",
  /** Le texte des items, la difficulté, la légende de l'image : Inter Light. */
  texte: "DR Texte",
  /** L'iceberg : titres de la couverture et étiquettes des hobbies, Inter Regular. */
  iceberg: "DR Iceberg",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "InterDisplay-Light.otf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Light.otf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Regular.otf"), POLICE.iceberg);
