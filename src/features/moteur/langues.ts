// Langues CIBLES supportées : la langue d'un poster est celle dans laquelle il
// PUBLIE, c.-à-d. la cible de traduction. Elle est indépendante de la langue des
// comptes sources (souvent FR) : un slideshow source stocké est simplement
// re-traduit vers chacune de ces langues (images nettoyées réutilisées, seul le
// texte change + insertion Sophia). Ajouter une langue ici suffit à l'exposer
// partout (création poster/recruteur, édition de compte).
import i18n from "@/locales";

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

const NOM_LANGUE_FR: Record<string, string> = {
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

const NOM_LANGUE_EN: Record<string, string> = {
  fr: "French",
  en: "English",
  de: "German",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  cs: "Czech",
  nl: "Dutch",
  el: "Greek",
  hu: "Hungarian",
  pl: "Polish",
  ro: "Romanian",
  sv: "Swedish",
  tr: "Turkish",
};

/** Drapeau emoji d'une langue cible (aligné Documents : en → 🇬🇧). */
const DRAPEAU_LANGUE: Record<string, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  de: "🇩🇪",
  it: "🇮🇹",
  es: "🇪🇸",
  pt: "🇵🇹",
  cs: "🇨🇿",
  nl: "🇳🇱",
  el: "🇬🇷",
  hu: "🇭🇺",
  pl: "🇵🇱",
  ro: "🇷🇴",
  sv: "🇸🇪",
  tr: "🇹🇷",
};

function codeLocale(locale?: string): string {
  return (locale ?? i18n.resolvedLanguage ?? i18n.language ?? "fr")
    .slice(0, 2)
    .toLowerCase();
}

function tableNoms(locale?: string): Record<string, string> {
  return codeLocale(locale) === "en" ? NOM_LANGUE_EN : NOM_LANGUE_FR;
}

/** Nom lisible d'une langue (« Allemand » / « German » plutôt que « DE »). */
export function nomLangue(code: string, locale?: string): string {
  return tableNoms(locale)[code] ?? code.toUpperCase();
}

/** Drapeau emoji d'une langue (« 🇩🇪 »), ou le code en majuscules si inconnu. */
export function drapeauLangue(code: string): string {
  return DRAPEAU_LANGUE[code] ?? code.toUpperCase();
}

/** Pays physiques de l'OS = un pays par langue cible (en → Royaume-Uni). */
export const PAYS_OS = LANGUES_CIBLES;

export type CodePaysOs = (typeof PAYS_OS)[number];

export function estPaysOs(code: string): code is CodePaysOs {
  return (PAYS_OS as readonly string[]).includes(code);
}
