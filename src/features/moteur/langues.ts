// Langues CIBLES supportées : la langue d'un poster est celle dans laquelle il
// PUBLIE, c.-à-d. la cible de traduction. Elle est indépendante de la langue des
// comptes sources (souvent FR) : un slideshow source stocké est simplement
// re-traduit vers chacune de ces langues (images nettoyées réutilisées, seul le
// texte change + insertion Sophia). Ajouter une langue ici suffit à l'exposer
// partout (création poster/recruteur, édition de compte).
export const LANGUES_CIBLES = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "pt",
  "cs",
  "nl",
  "el",
  "hu",
  "pl",
  "ro",
  "sv",
  "tr",
] as const;

const NOM_LANGUE: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  de: "Allemand",
  it: "Italien",
  es: "Espagnol",
  pt: "Portugais",
  cs: "Tchèque",
  nl: "Néerlandais",
  el: "Grec",
  hu: "Hongrois",
  pl: "Polonais",
  ro: "Roumain",
  sv: "Suédois",
  tr: "Turc",
};

/** Nom lisible d'une langue (« Allemand » plutôt que « DE »). */
export function nomLangue(code: string): string {
  return NOM_LANGUE[code] ?? code.toUpperCase();
}
