/**
 * RevenueCat segmente par nom de pays ; les créateurs de l'OS ont une langue.
 * On rattache chaque pays au code langue cible (fr, en, de…).
 */

import { LANGUES_CIBLES } from "@/features/moteur/langues";

const PAYS_VERS_LANGUE: Record<string, string> = {
  fr: "fr",
  france: "fr",
  en: "en",
  "united kingdom": "en",
  uk: "en",
  gb: "en",
  "great britain": "en",
  "united states": "en",
  "united states of america": "en",
  usa: "en",
  us: "en",
  australia: "en",
  ireland: "en",
  canada: "en",
  de: "de",
  germany: "de",
  deutschland: "de",
  austria: "de",
  switzerland: "de",
  it: "it",
  italy: "it",
  italia: "it",
  es: "es",
  spain: "es",
  espana: "es",
  mexico: "es",
  argentina: "es",
  colombia: "es",
  chile: "es",
  peru: "es",
  pt: "pt",
  portugal: "pt",
  brazil: "pt",
  brasil: "pt",
  cs: "cs",
  czechia: "cs",
  "czech republic": "cs",
  nl: "nl",
  netherlands: "nl",
  holland: "nl",
  belgium: "nl",
  el: "el",
  greece: "el",
  hu: "hu",
  hungary: "hu",
  pl: "pl",
  poland: "pl",
  ro: "ro",
  romania: "ro",
  sv: "sv",
  sweden: "sv",
  tr: "tr",
  turkey: "tr",
  turkiye: "tr",
};

const LANGUES = new Set<string>(LANGUES_CIBLES);

export function normaliserNomPays(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Pays RC (« France », « Türkiye ») → langue OS (`fr`, `tr`). */
export function langueDepuisPays(nomPays: string): string | null {
  const cle = normaliserNomPays(nomPays);
  if (!cle) return null;
  if (LANGUES.has(cle)) return cle;
  return PAYS_VERS_LANGUE[cle] ?? null;
}
