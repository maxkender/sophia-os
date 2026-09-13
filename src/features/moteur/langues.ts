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
  "da",
  "no",
  "ru",
  "hr",
  "sl",
  "sk",
  "sr",
  "ar",
  "he",
  "fi",
  "et",
] as const;

export const LANGUES_RTL = ["ar", "he"] as const;

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
  da: "Danois",
  no: "Norvégien",
  ru: "Russe",
  hr: "Croate",
  sl: "Slovène",
  sk: "Slovaque",
  sr: "Serbe",
  ar: "Arabe",
  he: "Hébreu",
  fi: "Finnois",
  et: "Estonien",
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
  da: "🇩🇰",
  no: "🇳🇴",
  ru: "🇷🇺",
  hr: "🇭🇷",
  sl: "🇸🇮",
  sk: "🇸🇰",
  sr: "🇷🇸",
  ar: "🇪🇬",
  he: "🇮🇱",
  fi: "🇫🇮",
  et: "🇪🇪",
};

/** Nom lisible d'une langue (« Allemand » plutôt que « DE »). */
export function nomLangue(code: string): string {
  return NOM_LANGUE[code] ?? code.toUpperCase();
}

/** Valeur initiale d'un sélecteur de langue : garde l'actuelle, sinon fr, sinon la 1ʳᵉ. */
export function langueInitiale(disponibles: string[], actuelle?: string): string {
  if (actuelle && disponibles.includes(actuelle)) return actuelle;
  if (disponibles.includes("fr")) return "fr";
  return disponibles[0] ?? "";
}

/** Drapeau emoji d'une langue (« 🇩🇪 »), ou le code en majuscules si inconnu. */
export function drapeauLangue(code: string): string {
  return DRAPEAU_LANGUE[code] ?? code.toUpperCase();
}

/** Nom du pays OS aligné sur la langue cible (en → Royaume-Uni). */
const NOM_PAYS: Record<string, string> = {
  fr: "France",
  en: "Royaume-Uni",
  de: "Allemagne",
  it: "Italie",
  es: "Espagne",
  pt: "Portugal",
  cs: "Tchéquie",
  nl: "Pays-Bas",
  el: "Grèce",
  hu: "Hongrie",
  pl: "Pologne",
  ro: "Roumanie",
  sv: "Suède",
  tr: "Turquie",
  da: "Danemark",
  no: "Norvège",
  ru: "Russie",
  hr: "Croatie",
  sl: "Slovénie",
  sk: "Slovaquie",
  sr: "Serbie",
  ar: "Égypte",
  he: "Israël",
  fi: "Finlande",
  et: "Estonie",
};

export function nomPays(code: string): string {
  return NOM_PAYS[code] ?? nomLangue(code);
}

/** Pays physiques de l'OS = un pays par langue cible (en → Royaume-Uni). */
export const PAYS_OS = LANGUES_CIBLES;

export type CodePaysOs = (typeof PAYS_OS)[number];

export function estPaysOs(code: string): code is CodePaysOs {
  return (PAYS_OS as readonly string[]).includes(code);
}

export function estLangueRtl(code: string | null | undefined): boolean {
  return (LANGUES_RTL as readonly string[]).includes((code ?? "").toLowerCase());
}

const RE_LETTRES_RTL = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function contientLettresRtl(texte?: string | null): boolean {
  return Boolean(texte && RE_LETTRES_RTL.test(texte));
}

/** Direction d'un bloc de contenu (slides, captions) — jamais l'UI OS.
 *  Le texte gagne : des lettres arabes/hébraïques → RTL ; du latin → LTR.
 *  La langue ne tranche que si le texte est vide (textarea, placeholder). */
export function directionTexte(langue?: string | null, texte?: string | null): "rtl" | "ltr" {
  if (contientLettresRtl(texte)) return "rtl";
  if (texte && texte.trim()) return "ltr";
  if (estLangueRtl(langue)) return "rtl";
  return "ltr";
}

/** Classes Tailwind pour un bloc de contenu RTL (aligné à droite). */
export function classeDirectionTexte(langue?: string | null, texte?: string | null): string {
  return directionTexte(langue, texte) === "rtl" ? "text-right" : "text-left";
}
