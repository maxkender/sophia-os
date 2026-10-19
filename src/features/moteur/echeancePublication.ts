/**
 * Échéance de publication d'un post (migration 0304, ticket Aram « change 3 ») :
 * la fin de sa date prévue à l'heure locale du poster. Passé ce moment, il ne
 * peut plus être marqué publié ni son lien modifié (le trigger
 * `posts_refuser_publication_hors_delai` refuse) : il compte comme manqué.
 *
 * Le fuseau vient du PAYS du compte. US, CA, AU et BR ont plusieurs fuseaux :
 * on prend le plus à l'ouest, qui finit la journée en dernier (personne
 * d'honnête n'est bloqué). Pays inconnu ou absent : Honolulu, le plus tolérant.
 *
 * Jumeau côté base : `public.fuseau_pays()` (0304). Un test compare les deux.
 */

export const FUSEAU_PAYS: Readonly<Record<string, string>> = Object.freeze({
  US: "America/Los_Angeles",
  CA: "America/Vancouver",
  AU: "Australia/Perth",
  BR: "America/Rio_Branco",
  MX: "America/Tijuana",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  CO: "America/Bogota",
  UY: "America/Montevideo",
  PE: "America/Lima",
  EC: "America/Guayaquil",
  VE: "America/Caracas",
  PY: "America/Asuncion",
  BO: "America/La_Paz",
  CR: "America/Costa_Rica",
  PA: "America/Panama",
  GT: "America/Guatemala",
  SV: "America/El_Salvador",
  HN: "America/Tegucigalpa",
  NI: "America/Managua",
  DO: "America/Santo_Domingo",
  CU: "America/Havana",
  PR: "America/Puerto_Rico",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  IS: "Atlantic/Reykjavik",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  BE: "Europe/Brussels",
  LU: "Europe/Luxembourg",
  NL: "Europe/Amsterdam",
  DE: "Europe/Berlin",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  IT: "Europe/Rome",
  MT: "Europe/Malta",
  DK: "Europe/Copenhagen",
  NO: "Europe/Oslo",
  SE: "Europe/Stockholm",
  FI: "Europe/Helsinki",
  EE: "Europe/Tallinn",
  LV: "Europe/Riga",
  LT: "Europe/Vilnius",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HU: "Europe/Budapest",
  SI: "Europe/Ljubljana",
  HR: "Europe/Zagreb",
  BA: "Europe/Sarajevo",
  RS: "Europe/Belgrade",
  ME: "Europe/Podgorica",
  MK: "Europe/Skopje",
  AL: "Europe/Tirane",
  RO: "Europe/Bucharest",
  MD: "Europe/Chisinau",
  BG: "Europe/Sofia",
  GR: "Europe/Athens",
  CY: "Asia/Nicosia",
  UA: "Europe/Kiev",
  BY: "Europe/Minsk",
  RU: "Europe/Kaliningrad",
  TR: "Europe/Istanbul",
  IL: "Asia/Jerusalem",
  JO: "Asia/Amman",
  LB: "Asia/Beirut",
  EG: "Africa/Cairo",
  MA: "Africa/Casablanca",
  DZ: "Africa/Algiers",
  TN: "Africa/Tunis",
  SA: "Asia/Riyadh",
  AE: "Asia/Dubai",
  QA: "Asia/Qatar",
  KW: "Asia/Kuwait",
  BH: "Asia/Bahrain",
  OM: "Asia/Muscat",
  KZ: "Asia/Almaty",
  AF: "Asia/Kabul",
  PK: "Asia/Karachi",
  IN: "Asia/Kolkata",
  NZ: "Pacific/Auckland",
});

/** Posts datés d'avant : pas d'échéance (règle lancée le 19/10, posters non prévenus avant). */
export const DEBUT_ECHEANCE = "2026-10-19";

/** Fuseau d'un compte qui n'a pas de pays connu : le plus tolérant. */
export const FUSEAU_PAR_DEFAUT = "Pacific/Honolulu";

export function fuseauPays(pays: string | null | undefined): string {
  return FUSEAU_PAYS[(pays ?? "").toUpperCase()] ?? FUSEAU_PAR_DEFAUT;
}

/** Décalage (ms) entre l'heure murale de `fuseau` et l'UTC, à l'instant donné. */
function decalage(instant: number, fuseau: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const mural = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return mural - Math.floor(instant / 1000) * 1000;
}

/** Minuit qui termine le jour `date` (AAAA-MM-JJ) dans `fuseau`. */
function finDuJour(date: string, fuseau: string): number {
  const [a, m, j] = date.split("-").map(Number);
  const minuitMural = Date.UTC(a, m - 1, j + 1, 0, 0, 0);
  // Deux passes : la seconde corrige un changement d'heure entre les deux.
  let instant = minuitMural - decalage(minuitMural, fuseau);
  instant = minuitMural - decalage(instant, fuseau);
  return instant;
}

/**
 * Échéance d'un post du jour `date` : fin de ce jour dans le fuseau du pays,
 * jamais avant la fin de ce jour à Paris (0320). Les posts arrivent à minuit
 * Paris : sans ce plancher, la Nouvelle-Zélande n'avait que 13 h pour publier.
 */
export function echeancePublication(date: string, pays: string | null | undefined): Date {
  return new Date(Math.max(finDuJour(date, fuseauPays(pays)), finDuJour(date, "Europe/Paris")));
}

/** Post non publié dont l'échéance est passée : manqué. */
export function estManque(
  post: { date_publication_prevue: string | null; publie_at: string | null },
  pays: string | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  if (post.publie_at || !post.date_publication_prevue) return false;
  return !publicationOuverte(post.date_publication_prevue, pays, maintenant);
}

/** Le poster peut-il encore marquer publié / corriger le lien ? */
export function publicationOuverte(
  date: string | null,
  pays: string | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  if (!date || date < DEBUT_ECHEANCE) return true;
  return maintenant.getTime() <= echeancePublication(date, pays).getTime();
}
