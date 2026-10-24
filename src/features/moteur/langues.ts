import i18next from "i18next";

/**
 * Libellé traduit, ou `undefined` si i18next n'est pas prêt ou n'a pas la clé.
 *
 * `nomLangue` et `nomPays` rendaient les tables françaises en dur, donc le
 * sélecteur FR/EN laissait « Anglais, Allemand, Tchèque » dans une interface
 * par ailleurs traduite. Les tables restent ici comme REPLI : une clé absente
 * doit afficher « Allemand », jamais « langues.de ». Elles servent aussi aux
 * tests unitaires, qui n'initialisent pas i18next.
 */
function libelleTraduit(cle: string): string | undefined {
  if (!i18next.isInitialized || !i18next.exists(cle)) return undefined;
  const valeur = i18next.t(cle);
  return typeof valeur === "string" && valeur && valeur !== cle ? valeur : undefined;
}

// Langues CIBLES supportées : la langue d'un poster est celle dans laquelle il
// PUBLIE, c.-à-d. la cible de traduction. Elle est indépendante de la langue des
// comptes sources (souvent FR) : un slideshow source stocké est simplement
// re-traduit vers chacune de ces langues (images nettoyées réutilisées, seul le
// texte change + insertion Sophia). Ajouter une langue ici suffit à l'exposer
// partout (création poster/recruteur, édition de compte).
//
// Un code peut porter un suffixe de région BCP-47 (`es-419`, `pt-BR`) : c'est
// alors une VARIANTE, une langue différente pour le moteur comme pour le
// modèle. Elle existe parce que `PAYS_OS = LANGUES_CIBLES` — un code = un
// marché de posteurs — et que servir le même texte des deux côtés de
// l'Atlantique se paie cash : `es` est du castillan, `es-419` de l'espagnol
// latino-américain neutre, `pt` du portugais européen, `pt-BR` du brésilien.
// Avant ces variantes, les posteuses du Portugal recevaient du brésilien (le
// modèle n'avait aucune consigne de région et retombait sur sa variante la
// plus représentée) et le réécrivaient à la main slide par slide.
//
// Ajouter une variante oblige à la servir partout où la langue est une clé :
// `NOM_LANGUE`, `DRAPEAU_LANGUE`, `NOM_PAYS` ici, `HASHTAGS_PAR_LANGUE`,
// `placementParDefaut`, la table `LANGUES` de `gemini.ts` (c'est elle qui
// nomme la région au modèle) et un prompt `traduction_<code>` en base.
export const LANGUES_CIBLES = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "es-419",
  "pt",
  "pt-BR",
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
  "bg",
] as const;

/**
 * Code canonique de `LANGUES_CIBLES` pour une saisie de casse quelconque :
 * `pt-br` → `pt-BR`. Les colonnes et les clés de File stockent le code
 * canonique ; un `.toLowerCase()` produisait `pt-br`, que ni la liste ni les
 * tables clées par langue ne connaissent. Code inconnu : minuscules.
 * Rien à voir avec le repli régional des contenus livrés (`pt-BR` → `pt`).
 */
export function canoniserLangue(code: string | null | undefined): string {
  const bas = String(code ?? "").trim().toLowerCase();
  return LANGUES_CIBLES.find((c) => c.toLowerCase() === bas) ?? bas;
}

export const LANGUES_RTL = ["ar", "he"] as const;

const NOM_LANGUE: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  de: "Allemand",
  it: "Italien",
  es: "Espagnol (Espagne)",
  "es-419": "Espagnol (Amérique latine)",
  pt: "Portugais (Portugal)",
  "pt-BR": "Portugais (Brésil)",
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
  bg: "Bulgare",
};

/** Drapeau emoji d'une langue cible (aligné Documents : en → 🇬🇧). */
const DRAPEAU_LANGUE: Record<string, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  de: "🇩🇪",
  it: "🇮🇹",
  es: "🇪🇸",
  "es-419": "🌎",
  pt: "🇵🇹",
  "pt-BR": "🇧🇷",
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
  bg: "🇧🇬",
};

/** Nom lisible d'une langue, dans la langue de l'interface (FR/EN). */
export function nomLangue(code: string): string {
  return libelleTraduit(`langues.${code}`) ?? NOM_LANGUE[code] ?? code.toUpperCase();
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
  // Pas un pays : le marché hispanophone des Amériques, recruté comme un tout
  // (Mexique, Colombie, Argentine, Chili, Pérou…). Un seul deck les sert.
  "es-419": "Amérique latine",
  pt: "Portugal",
  "pt-BR": "Brésil",
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
  bg: "Bulgarie",
};

export function nomPays(code: string): string {
  return libelleTraduit(`pays.${code}`) ?? NOM_PAYS[code] ?? nomLangue(code);
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
