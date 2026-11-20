// Les polices du compte modèle (@studyingsmiski, ses gabarits Canva), calées
// sur ses slides (relevé du 20/11) et enregistrées sous des noms à nous.
// Fichiers statiques officiels de Google Fonts, SIL OFL (polices/OFL-*.txt).
// Sa police de texte est Google Sans (pas libre) : Figtree a les mêmes
// largeurs à 1 % près sur ses lignes.

import { GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";

const DOSSIER = join(import.meta.dirname, "..", "polices");

export const POLICE = {
  /** Le titre de la couverture (« 4 apps you need as a student! ») : Fredoka Bold, resserrée. */
  titre: "SM Titre",
  /** Le nom de l'appli et sa ligne de plateformes : Figtree Bold. */
  gras: "SM Gras",
  /** La description d'une appli, le texte d'un conseil : Figtree Regular. */
  texte: "SM Texte",
  /** Les bulles et le sous-titre manuscrits (« from a straight A student ») : Gaegu Bold. */
  main: "SM Main",
  /** Le titre quand Fredoka n'a pas les lettres de la langue (ő, ű, ş, ğ, İ, č, ć, đ) : Nunito Black (instance statique), ronde aussi. */
  titreEtendu: "SM Titre Etendu",
  /** La main hors de l'anglais : Gaegu n'a aucun accent, Patrick Hand (même trait de feutre) a tout le latin étendu. */
  mainEtendue: "SM Main Etendue",
} as const;

/** Les langues où Fredoka manque de lettres (hongrois, turc, slovène). */
const SANS_FREDOKA = new Set(["hu", "tr", "sl"]);
/** La police du titre de couverture dans une langue. */
export const policeTitre = (langue: string) => (SANS_FREDOKA.has(langue) ? POLICE.titreEtendu : POLICE.titre);
/** La police manuscrite (bulles, sous-titre) dans une langue : Gaegu en anglais seulement. */
export const policeMain = (langue: string) => (langue === "en" ? POLICE.main : POLICE.mainEtendue);

GlobalFonts.registerFromPath(join(DOSSIER, "Fredoka-Bold.ttf"), POLICE.titre);
GlobalFonts.registerFromPath(join(DOSSIER, "Figtree-Bold.ttf"), POLICE.gras);
GlobalFonts.registerFromPath(join(DOSSIER, "Figtree-Regular.ttf"), POLICE.texte);
GlobalFonts.registerFromPath(join(DOSSIER, "Gaegu-Bold.ttf"), POLICE.main);
GlobalFonts.registerFromPath(join(DOSSIER, "Nunito-Black.ttf"), POLICE.titreEtendu);
GlobalFonts.registerFromPath(join(DOSSIER, "PatrickHand-Regular.ttf"), POLICE.mainEtendue);
