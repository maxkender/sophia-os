// Les polices du compte modèle (@thebiomechanic), calées sur ses slides
// (relevé du 20/11) : Playfair Display partout (Regular pour la couverture,
// Bold pour les tiers, les noms et le texte), et une linéale grasse pour le
// mot « CORTISOL » de la jauge (Arimo Bold). SIL OFL (polices/OFL-*.txt),
// enregistrées sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** « Morning Tierlist / For … Health », « (Science based) ». */
  fin: "BM Fin",
  /** « S TIER », le nom de l'élément, le texte, « Optimal ». */
  gras: "BM Gras",
  /** La jauge : LOW, MEDIUM, HIGH, CORTISOL. */
  jauge: "BM Jauge",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "PlayfairDisplay-Regular.ttf"), POLICE.fin);
GlobalFonts.registerFromPath(join(DOSSIER, "PlayfairDisplay-Bold.ttf"), POLICE.gras);
GlobalFonts.registerFromPath(join(DOSSIER, "Arimo-Bold.ttf"), POLICE.jauge);
