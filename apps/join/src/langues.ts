// Les langues de Join (24/11, Max : toutes les langues de l'OS) et la langue de chaque pays. Sans dépendance au
// navigateur ni à Vite : aussi lu par les tests (src/test/joinLangues.test.ts à la racine).

/** Code de Join → nom natif. Les variantes de l'OS sont servies par leur langue : es-419 → es, pt-BR → pt (brésilien). */
export const NOMS_LANGUES: Readonly<Record<string, string>> = {
  en: "English", fr: "Français", es: "Español", it: "Italiano", de: "Deutsch", pt: "Português (Brasil)",
  ro: "Română", pl: "Polski", hu: "Magyar", tr: "Türkçe", nl: "Nederlands", el: "Ελληνικά", hr: "Hrvatski",
  sr: "Srpski", cs: "Čeština", sk: "Slovenčina", bg: "Български", sv: "Svenska", da: "Dansk", no: "Norsk",
  fi: "Suomi", et: "Eesti", lv: "Latviešu", lt: "Lietuvių", sl: "Slovenščina", ru: "Русский", he: "עברית",
  ar: "العربية", ja: "日本語", ko: "한국어",
};

/** Les langues écrites de droite à gauche. */
export const LANGUES_RTL: readonly string[] = ["he", "ar"];

export const estRtl = (langue: string): boolean => LANGUES_RTL.includes(langue);

/**
 * Langue de Join d'un pays : celle de l'OS (LANGUE_PAR_PAYS de supabase/functions/_shared/hub_posteurs.ts), es-419
 * servi en « es » et pt-BR en « pt ». Pays absent ou langue que Join n'a pas (uk) : l'anglais.
 */
export const LANGUE_PAR_PAYS: Readonly<Record<string, string>> = {
  FR: "fr", MC: "fr", BE: "fr", LU: "fr",
  DE: "de", AT: "de", LI: "de", CH: "de",
  IT: "it", SM: "it",
  ES: "es", MX: "es", CO: "es", AR: "es", CL: "es", PE: "es", EC: "es", CR: "es", UY: "es", VE: "es", BO: "es",
  PY: "es", GT: "es", DO: "es", HN: "es", NI: "es", PA: "es", SV: "es",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
  NL: "nl", PL: "pl", RO: "ro", MD: "ro", HU: "hu", CZ: "cs", SK: "sk", BG: "bg",
  GR: "el", CY: "el", HR: "hr", SI: "sl", RS: "sr", ME: "sr", BA: "sr",
  SE: "sv", NO: "no", DK: "da", FI: "fi", EE: "et", LV: "lv", LT: "lt",
  TR: "tr", IL: "he", AE: "ar", SA: "ar", EG: "ar", LB: "ar",
  RU: "ru", BY: "ru", KZ: "ru",
  US: "en", GB: "en", IE: "en", AU: "en", NZ: "en", CA: "en",
  JP: "ja", KR: "ko",
};

/** Codes de navigateur qui ne sont pas ceux de Join : norvégien (nb, nn), hébreu ancien code (iw). */
const ALIAS: Readonly<Record<string, string>> = { nb: "no", nn: "no", iw: "he" };

/**
 * La langue de Join pour les langues du navigateur (dans l'ordre de préférence) : la première que Join connaît ;
 * sinon celle du pays de la première qui en donne un (« xx-FI » → fi) ; sinon l'anglais.
 */
export function langueDuNavigateur(langues: readonly string[], connues: (code: string) => boolean): string {
  for (const l of langues) {
    const base = l.split(/[-_]/)[0].toLowerCase();
    const c = ALIAS[base] ?? base;
    if (connues(c)) return c;
  }
  for (const l of langues) {
    const region = l.split(/[-_]/).find((m, i) => i > 0 && /^[A-Za-z]{2}$/.test(m))?.toUpperCase();
    const c = region ? LANGUE_PAR_PAYS[region] : undefined;
    if (c && connues(c)) return c;
  }
  return "en";
}
