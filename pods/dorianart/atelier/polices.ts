// La police de ses icebergs (@dorian.frog, relevé du 15/11 pour le podz 16,
// reprise le 27/11) : Inter Regular (SIL OFL, polices/Inter-LICENSE.txt),
// pour « Iceberg of », le titre et les noms des loisirs. Enregistrée sous un
// nom à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** La couverture (« Iceberg of », « ADHD hobbies ») et les noms des loisirs. */
  iceberg: "DA Iceberg",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Inter-Regular.otf"), POLICE.iceberg);
