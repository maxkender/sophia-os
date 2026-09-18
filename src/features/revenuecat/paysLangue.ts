/**
 * RevenueCat segmente par pays ; les créateurs de l'OS ont une langue.
 * On rattache chaque pays au code langue cible (fr, en, de…).
 *
 * ⚠️ PIÈGE CORRIGÉ : un segment à deux lettres est un code PAYS ISO-3166, pas
 * un code langue. L'ancienne version testait d'abord « est-ce une de nos
 * langues ? », si bien que :
 *   AR (Argentine)     → arabe      au lieu d'espagnol
 *   SV (Salvador)      → suédois    au lieu d'espagnol
 *   ET (Éthiopie)      → estonien   au lieu de rien
 *   SL (Sierra Leone)  → slovène    au lieu de rien
 *   SR (Suriname)      → serbe      au lieu de rien
 * et symétriquement les VRAIS codes CZ, GR, DK, SE, RS, SI, EE, IL ne
 * résolvaient rien — les revenus tchèques, grecs, danois, suédois, serbes,
 * slovènes, estoniens et israéliens étaient perdus.
 *
 * L'ordre est donc : code pays ISO, puis nom de pays, puis — en tout dernier —
 * les rares codes langue qui ne sont PAS des codes pays et ne peuvent donc
 * entrer en collision (en, cs, el, da, he).
 */

import { LANGUES_CIBLES } from "@/features/moteur/langues";

/**
 * Code pays ISO-3166 alpha-2 → langue OS.
 *
 * Pays multilingues : on prend la langue MAJORITAIRE, faute de découpage
 * disponible côté RevenueCat. C'est un choix assumé, pas un oubli — il sous-
 * estime le français (Belgique wallonne, Suisse romande, Québec) au profit du
 * néerlandais, de l'allemand et de l'anglais.
 */
const CODES_ISO_PAYS: Record<string, string> = {
  fr: "fr",
  gb: "en",
  us: "en",
  ca: "en", // majoritaire — le Québec francophone est compté ici
  au: "en",
  ie: "en",
  nz: "en",
  de: "de",
  at: "de",
  ch: "de", // majoritaire — la Suisse romande et italienne sont comptées ici
  it: "it",
  es: "es",
  mx: "es",
  ar: "es", // Argentine, PAS l'arabe
  co: "es",
  cl: "es",
  pe: "es",
  sv: "es", // Salvador, PAS la Suède (SE)
  pt: "pt",
  br: "pt",
  cz: "cs",
  nl: "nl",
  be: "nl", // majoritaire — la Belgique francophone est comptée ici
  gr: "el",
  hu: "hu",
  pl: "pl",
  ro: "ro",
  se: "sv",
  tr: "tr",
  dk: "da",
  no: "no",
  ru: "ru",
  hr: "hr",
  si: "sl", // Slovénie ; SL = Sierra Leone, hors marché
  sk: "sk",
  rs: "sr", // Serbie ; SR = Suriname, hors marché
  eg: "ar",
  sa: "ar",
  ae: "ar",
  il: "he",
  fi: "fi",
  ee: "et", // Estonie ; ET = Éthiopie, hors marché
  bg: "bg", // Bulgarie ; BG est à la fois le pays et la langue, aucune collision
};

/** Nom de pays (normalisé) → langue OS. Inclut les abréviations non-ISO. */
const NOMS_PAYS: Record<string, string> = {
  france: "fr",
  "united kingdom": "en",
  uk: "en",
  "great britain": "en",
  britain: "en",
  england: "en",
  "united states": "en",
  "united states of america": "en",
  usa: "en",
  australia: "en",
  ireland: "en",
  canada: "en",
  "new zealand": "en",
  germany: "de",
  deutschland: "de",
  austria: "de",
  switzerland: "de",
  italy: "it",
  italia: "it",
  spain: "es",
  espana: "es",
  mexico: "es",
  argentina: "es",
  colombia: "es",
  chile: "es",
  peru: "es",
  "el salvador": "es",
  portugal: "pt",
  brazil: "pt",
  brasil: "pt",
  czechia: "cs",
  "czech republic": "cs",
  netherlands: "nl",
  holland: "nl",
  belgium: "nl",
  greece: "el",
  hungary: "hu",
  poland: "pl",
  romania: "ro",
  sweden: "sv",
  sverige: "sv",
  turkey: "tr",
  turkiye: "tr",
  denmark: "da",
  danmark: "da",
  norway: "no",
  norge: "no",
  russia: "ru",
  croatia: "hr",
  slovenia: "sl",
  slovakia: "sk",
  serbia: "sr",
  egypt: "ar",
  "saudi arabia": "ar",
  "united arab emirates": "ar",
  uae: "ar",
  emirates: "ar",
  israel: "he",
  finland: "fi",
  suomi: "fi",
  estonia: "et",
  bulgaria: "bg",
  balgariya: "bg",
};

/**
 * Codes langue acceptés tels quels : uniquement ceux qui ne sont PAS des codes
 * pays ISO-3166, donc sans collision possible. Tous les autres codes à deux
 * lettres sont résolus comme des pays.
 */
const CODES_LANGUE_SANS_COLLISION: Record<string, string> = {
  en: "en",
  cs: "cs",
  el: "el",
  da: "da",
  he: "he",
};

const LANGUES = new Set<string>(LANGUES_CIBLES);

export function normaliserNomPays(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Pays RC (« France », « TR », « Türkiye ») → langue OS (`fr`, `tr`). */
export function langueDepuisPays(nomPays: string): string | null {
  const cle = normaliserNomPays(nomPays);
  if (!cle) return null;
  return (
    CODES_ISO_PAYS[cle] ??
    NOMS_PAYS[cle] ??
    CODES_LANGUE_SANS_COLLISION[cle] ??
    null
  );
}

/** Langues référencées par les tables — toutes doivent être des langues cibles. */
export function languesReferencees(): string[] {
  return [
    ...new Set([
      ...Object.values(CODES_ISO_PAYS),
      ...Object.values(NOMS_PAYS),
      ...Object.values(CODES_LANGUE_SANS_COLLISION),
    ]),
  ].filter((l) => !LANGUES.has(l));
}
