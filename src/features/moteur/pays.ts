import i18next from "i18next";

/**
 * Pays d'un compte (`comptes.pays`), en ISO-3166-1 alpha-2.
 *
 * À ne pas confondre avec `PAYS_OS` de `langues.ts`, qui n'est qu'un alias de
 * `LANGUES_CIBLES` : là-bas un code de LANGUE sert de pays, si bien que le
 * Royaume-Uni, les États-Unis, l'Australie, la Nouvelle-Zélande et l'Irlande
 * sont un seul « pays » `en` au drapeau 🇬🇧. Ce module est la vraie dimension
 * géographique, indépendante de la langue de publication.
 *
 * Rien dans le moteur ne lit le pays : l'assignation, la traduction et le
 * placement ne regardent que `comptes.langue`. Le pays sert à voir où est un
 * posteur et à bâtir des cibles de recrutement.
 */

/**
 * Codes ISO-3166-1 alpha-2 officiellement attribués, moins les territoires
 * sans population permanente (AQ, BV, HM, TF, UM, GS, CC, CX, NF, PN, SJ,
 * IO) : personne ne recrute un posteur à l'île Bouvet, et les laisser
 * allongeait la liste déroulante pour rien.
 */
const CODES_ISO =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET " +
  "FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY " +
  "HK HN HR HT HU ID IE IL IM IN IQ IR IS IT " +
  "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ " +
  "LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NG NI NL NO NP NR NU NZ OM " +
  "PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

export const PAYS_ISO: readonly string[] = Object.freeze(CODES_ISO.split(" "));

const SET_ISO = new Set(PAYS_ISO);

export function estCodePays(code: string | null | undefined): boolean {
  return Boolean(code) && SET_ISO.has(code as string);
}

/**
 * Drapeau emoji calculé depuis le code : deux « regional indicator symbols ».
 * Pas de table à maintenir, et un pays ajouté à l'ISO marche tout seul.
 */
export function drapeauPays(code: string | null | undefined): string {
  if (!estCodePays(code)) return "";
  return String.fromCodePoint(
    ...[...(code as string)].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/**
 * Nom du pays dans la langue de l'interface, via `Intl.DisplayNames` : aucune
 * table FR/EN à tenir à jour, et les 200+ pays sont couverts d'office.
 */
export function nomPaysIso(code: string | null | undefined): string {
  if (!estCodePays(code)) return "";
  const langue = i18next.resolvedLanguage ?? i18next.language ?? "fr";
  try {
    return new Intl.DisplayNames([langue], { type: "region" }).of(code as string) ?? (code as string);
  } catch {
    return code as string;
  }
}

/** Code + nom, triés par nom dans la langue de l'interface. */
export function paysTries(): Array<{ code: string; nom: string }> {
  const langue = i18next.resolvedLanguage ?? i18next.language ?? "fr";
  return PAYS_ISO.map((code) => ({ code, nom: nomPaysIso(code) })).sort((a, b) =>
    a.nom.localeCompare(b.nom, langue),
  );
}

/**
 * Pays déduit de la langue, là où la langue ne désigne qu'un seul de nos
 * marchés. Jumeau du remplissage de la migration 0278 : `en`, `ar` et
 * `es-419` sont ABSENTS exprès, parce qu'ils couvrent plusieurs pays et qu'un
 * défaut faux est pire qu'un champ vide. Sert à proposer une valeur à la
 * création d'un compte, jamais à en écraser une.
 */
export const PAYS_PAR_DEFAUT_LANGUE: Readonly<Record<string, string>> = Object.freeze({
  fr: "FR",
  de: "DE",
  it: "IT",
  es: "ES",
  pt: "PT",
  "pt-BR": "BR",
  cs: "CZ",
  nl: "NL",
  el: "GR",
  hu: "HU",
  pl: "PL",
  ro: "RO",
  sv: "SE",
  tr: "TR",
  da: "DK",
  no: "NO",
  ru: "RU",
  hr: "HR",
  sl: "SI",
  sk: "SK",
  sr: "RS",
  he: "IL",
  fi: "FI",
  et: "EE",
  bg: "BG",
});

export function paysParDefaut(langue: string | null | undefined): string | null {
  return PAYS_PAR_DEFAUT_LANGUE[langue ?? ""] ?? null;
}
