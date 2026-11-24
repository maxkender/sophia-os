// La police du compte modèle (@raretheory_), calée sur ses slides (relevé du
// 24/11) : de l'Arial Narrow (CapCut), en Regular, un mot en gras à la fin.
// Arimo (SIL OFL, polices/OFL-Arimo.txt) a les métriques d'Arial ; on la
// resserre au rendu (`ETROIT` dans slides.ts : 89 % de sa largeur, mesuré sur
// ses titres et ses listes). Enregistrée sous des noms à nous.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Tout le texte : couverture, titres « 01 — … », sujets, paragraphes. */
  texte: "RT Texte",
  /** La phrase en gras de la fin (« OR.. »). */
  gras: "RT Gras",
} as const;

GlobalFonts.registerFromPath(join(DOSSIER, "Arimo-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "Arimo-Bold.ttf"), POLICE.gras);
