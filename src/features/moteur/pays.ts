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
 * Les 249 codes ISO-3166-1 alpha-2 officiellement attribués, sans exception.
 *
 * Une première version retirait les douze territoires sans population
 * permanente (AQ, BV, HM…), par souci de concision. Mauvais calcul : un
 * utilisateur qui cherche un pays et ne le trouve pas ne se dit pas « il a
 * dû être filtré », il se dit que la liste est cassée, et il a raison de s'en
 * méfier. Une liste de référence se tient entière ou pas du tout.
 */
const CODES_ISO =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET " +
  "FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT " +
  "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ " +
  "LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM " +
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

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
 * marchés. Quatre langues sont ABSENTES exprès, parce qu'elles couvrent
 * plusieurs pays et qu'un défaut faux est pire qu'un champ vide : personne ne
 * vient vérifier un champ rempli.
 *   `en`     Royaume-Uni, États-Unis, Australie, Nouvelle-Zélande, Irlande, Canada
 *   `ar`     Émirats, Égypte
 *   `es-419` toute l'Amérique latine
 *   `ru`     Kazakhstan, Ukraine, Biélorussie. `RU` lui-même n'est pas un de nos
 *            marchés : la ligne de recrutement s'appelle « Russian-Speaking
 *            (not russia) ». Nos deux comptes russophones sont kazakhs.
 *
 * Jumeau côté base : le trigger `comptes_pays_defaut` (migration 0281), qui
 * applique la même table à l'INSERT, d'où que vienne la création. Les deux
 * doivent rester synchronisés.
 *
 * Sert à proposer une valeur, jamais à en écraser une.
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

/**
 * Langues dont le pays par défaut n'est pas le seul marché, mais de loin le
 * premier : le HM garde le défaut pré-rempli et peut choisir un des autres
 * pays de cette courte liste (défaut en tête). Rien à changer côté base : le
 * trigger 0281 ne pose le défaut que si `pays` arrive vide.
 *   `de` Allemagne, Autriche, Suisse (ticket Aram, 18/10).
 */
export const PAYS_PROPOSES_LANGUE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  de: ["DE", "AT", "CH"],
});

export function paysProposes(langue: string | null | undefined): readonly string[] | null {
  return PAYS_PROPOSES_LANGUE[langue ?? ""] ?? null;
}
