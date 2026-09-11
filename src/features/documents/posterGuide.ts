/**
 * Copie de src/features/documents/posterGuide.ts — garder les deux alignés.
 * Quel guide créateur montrer. Les posters déjà en base avant le cutoff
 * gardent `guide_poster` (contrat inchangé). Les comptes créés après voient
 * le guide de leur zone de paiement, d’après le pays / la langue du compte.
 *
 * Ne pas utiliser `profiles.langues[0]` tout seul : sur l’OS c’est souvent
 * `fr` par défaut, la vraie langue de publication est `comptes.langue`.
 */

/** Posters existants au 11 sept. 2026 08:01 UTC inclus — pas ceux d’après. */
export const POSTER_GUIDE_ZONE_CUTOFF = "2026-09-11T08:02:00.000Z";

export type PosterZone = "a" | "b" | "c";

export function posterGuideCle(opts: {
  profileCreatedAt: string | null | undefined;
  nationalite?: string | null;
  langues?: string[] | null;
  compteLangues?: Array<string | null | undefined> | null;
}): string {
  if (!opts.profileCreatedAt || new Date(opts.profileCreatedAt).getTime() <= Date.parse(POSTER_GUIDE_ZONE_CUTOFF)) {
    return "guide_poster";
  }
  const zone = resoudreZonePoster(opts.nationalite, opts.compteLangues, opts.langues);
  return zone ? `guide_poster_zone_${zone}` : "guide_poster";
}

export function resoudreZonePoster(
  nationalite?: string | null,
  compteLangues?: Array<string | null | undefined> | null,
  langues?: string[] | null,
): PosterZone | null {
  const comptes = (compteLangues ?? []).map((l) => normaliser(l)).filter(Boolean);
  const nat = normaliser(nationalite);

  // `fr` sur le profil est souvent un défaut OS, pas le pays du créateur.
  const nationaliteUtile =
    nat && !(nat === "fr" && comptes.some((c) => c !== "fr" && zoneDepuisJeton(c)));

  const candidats: string[] = [];
  if (nationaliteUtile) candidats.push(nat);
  for (const c of comptes) candidats.push(c);
  for (const l of [...(langues ?? [])].reverse()) {
    const n = normaliser(l);
    if (n) candidats.push(n);
  }

  for (const jeton of candidats) {
    const zone = zoneDepuisJeton(jeton);
    if (zone) return zone;
  }
  return null;
}

export function garderDocumentsPoster<T extends { cle?: string | null }>(docs: T[], guideCle: string): T[] {
  return docs.filter((d) => {
    const cle = d.cle ?? "";
    if (cle.startsWith("guide_poster_zone_")) return cle === guideCle;
    if (cle === "guide_poster") return guideCle === "guide_poster";
    return true;
  });
}

function normaliser(valeur: string | null | undefined): string {
  return (valeur ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function zoneDepuisJeton(jeton: string): PosterZone | null {
  if (!jeton) return null;
  if (ZONE_A.has(jeton)) return "a";
  if (ZONE_B.has(jeton)) return "b";
  if (ZONE_C.has(jeton)) return "c";
  return null;
}

/** Zone A — $15 / $60. Codes OS + pays du PDF manager. */
const ZONE_A = new Set([
  "fr",
  "france",
  "francais",
  "french",
  "nl",
  "netherlands",
  "nederland",
  "holland",
  "hollandais",
  "pays bas",
  "dutch",
  "de",
  "germany",
  "deutschland",
  "allemagne",
  "german",
  "allemand",
  "be",
  "belgium",
  "belgique",
  "belgie",
  "belgien",
  "at",
  "austria",
  "osterreich",
  "autriche",
  "ie",
  "ireland",
  "eire",
  "irlande",
  "gb",
  "uk",
  "united kingdom",
  "england",
  "britain",
  "great britain",
  "royaume uni",
  "dk",
  "denmark",
  "danemark",
  "danmark",
  "no",
  "norway",
  "norvege",
  "norge",
  "norsk",
  "se",
  "sweden",
  "suede",
  "sverige",
  "sv",
  "svenska",
  "suedois",
  "fi",
  "finland",
  "finlande",
  "suomi",
  "is",
  "iceland",
  "islande",
  "island",
  "lu",
  "luxembourg",
  "ch",
  "switzerland",
  "suisse",
  "schweiz",
  "svizzera",
  "us",
  "usa",
  "united states",
  "united states of america",
  "america",
  "etats unis",
  "ca",
  "canada",
  "au",
  "australia",
  "australie",
  "nz",
  "new zealand",
  "nouvelle zelande",
  "aotearoa",
  "jp",
  "japan",
  "japon",
  "japanese",
  "sg",
  "singapore",
  "singapour",
  "en",
  "english",
  "anglais",
  "da",
  "nb",
]);

/** Zone B — $11 / $42. `pt` = Portugal (l’OS). Brésil → Zone C via br/brazil. */
const ZONE_B = new Set([
  "es",
  "spain",
  "espagne",
  "espana",
  "spanish",
  "espagnol",
  "it",
  "italy",
  "italie",
  "italia",
  "italian",
  "italien",
  "pt",
  "portugal",
  "portugais",
  "portuguese",
  "el",
  "gr",
  "greece",
  "grece",
  "greek",
  "grec",
  "pl",
  "poland",
  "pologne",
  "polska",
  "polish",
  "polonais",
  "cz",
  "cs",
  "czech",
  "czechia",
  "czech republic",
  "tchequie",
  "cesko",
  "tcheque",
  "sk",
  "slovakia",
  "slovaquie",
  "slovensko",
  "hu",
  "hungary",
  "hongrie",
  "magyarorszag",
  "hungarian",
  "hongrois",
  "si",
  "slovenia",
  "slovenie",
  "slovenija",
  "hr",
  "croatia",
  "croatie",
  "hrvatska",
  "ee",
  "estonia",
  "estonie",
  "eesti",
  "lv",
  "latvia",
  "lettonie",
  "latvija",
  "lt",
  "lithuania",
  "lituanie",
  "lietuva",
  "il",
  "israel",
  "kr",
  "korea",
  "south korea",
  "coree",
  "coree du sud",
  "korean",
  "ae",
  "uae",
  "united arab emirates",
  "emirates",
  "emirats",
  "emirats arabes unis",
  "cl",
  "chile",
  "chili",
  "uy",
  "uruguay",
  "arabic",
  "arabe",
  "gulf",
]);

/** Zone C — $7 / $27. `ar` = ISO Argentine (l’arabe s’écrit arabic / arabe, Zone B). */
const ZONE_C = new Set([
  "ro",
  "romania",
  "roumanie",
  "romanian",
  "roumain",
  "bg",
  "bulgaria",
  "bulgarie",
  "bulgarian",
  "bulgare",
  "rs",
  "serbia",
  "serbie",
  "srbija",
  "ua",
  "ukraine",
  "ukrainien",
  "ge",
  "georgia",
  "georgie",
  "am",
  "armenia",
  "armenie",
  "tr",
  "turkey",
  "turkiye",
  "turquie",
  "turkish",
  "turc",
  "mx",
  "mexico",
  "mexique",
  "co",
  "colombia",
  "colombie",
  "br",
  "brazil",
  "brasil",
  "bresil",
  "brazilian",
  "bresilien",
  "ar",
  "argentina",
  "argentine",
  "za",
  "south africa",
  "afrique du sud",
  "ma",
  "morocco",
  "maroc",
  "my",
  "malaysia",
  "malaisie",
  "th",
  "thailand",
  "thailande",
  "vn",
  "vietnam",
  "ph",
  "philippines",
  "in",
  "india",
  "inde",
  "id",
  "indonesia",
  "indonesie",
]);
