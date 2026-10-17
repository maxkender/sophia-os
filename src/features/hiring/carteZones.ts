/**
 * Carte des zones de recrutement (page Posters) : décisions pures.
 *
 * Une zone est du texte libre (`profiles.zone_recrutement`, master list
 * Notion) : « Turkey + Israel », « Estonia + Finland + Russian-speaking »,
 * « US + UK »… On la découpe en pays, chaque pays nommé comme le fond de carte
 * (Natural Earth 110m, paquet `world-atlas`) l'écrit. Un morceau qu'on ne sait
 * pas placer n'est pas perdu : il est rendu dans `inconnus` et la carte le dit.
 *
 * Couleur : 14 zones, c'est trop pour une couleur chacune (au-delà de trois,
 * deux voisines se confondent). La carte colore donc le NOMBRE de créateurs de
 * la zone sur un seul dégradé ; l'identité de la zone vient du survol et des
 * puces de zone, qui servent de légende.
 */

/** Pays → noms du fond de carte. Clés normalisées par `normaliserMorceau`. */
const ALIAS: Record<string, readonly string[]> = {
  // Abréviations et noms de la master list (anglais), puis variantes françaises.
  us: ["United States of America"],
  usa: ["United States of America"],
  "united states": ["United States of America"],
  "etats unis": ["United States of America"],
  uk: ["United Kingdom"],
  "great britain": ["United Kingdom"],
  england: ["United Kingdom"],
  "royaume uni": ["United Kingdom"],
  uae: ["United Arab Emirates"],
  emirates: ["United Arab Emirates"],
  "emirats arabes unis": ["United Arab Emirates"],
  nz: ["New Zealand"],
  "nouvelle zelande": ["New Zealand"],
  "czech republic": ["Czechia"],
  tchequie: ["Czechia"],
  "republique tcheque": ["Czechia"],
  turkiye: ["Turkey"],
  turquie: ["Turkey"],
  allemagne: ["Germany"],
  norvege: ["Norway"],
  italie: ["Italy"],
  croatie: ["Croatia"],
  slovenie: ["Slovenia"],
  espagne: ["Spain"],
  pologne: ["Poland"],
  "pays bas": ["Netherlands"],
  holland: ["Netherlands"],
  roumanie: ["Romania"],
  suede: ["Sweden"],
  estonie: ["Estonia"],
  finlande: ["Finland"],
  grece: ["Greece"],
  danemark: ["Denmark"],
  slovaquie: ["Slovakia"],
  bulgarie: ["Bulgaria"],
  hongrie: ["Hungary"],
  serbie: ["Serbia"],
  australie: ["Australia"],
  irlande: ["Ireland"],
  belgique: ["Belgium"],
  suisse: ["Switzerland"],
  autriche: ["Austria"],
  bresil: ["Brazil"],
  mexique: ["Mexico"],
  japon: ["Japan"],
  coree: ["South Korea"],
  "south korea": ["South Korea"],
  korea: ["South Korea"],
  russie: ["Russia"],
  // Les créateurs russophones : pas un pays, et surtout pas la Russie (la ligne
  // Notion disait « not russia »). Kazakhstan, Ukraine, Biélorussie, comme les
  // trois lignes de Recruitment Targets et le job Hired (_shared/notion.ts).
  "russian speaking": ["Kazakhstan", "Ukraine", "Belarus"],
  russophone: ["Kazakhstan", "Ukraine", "Belarus"],
  russophones: ["Kazakhstan", "Ukraine", "Belarus"],
};

/** Minuscules, sans accents ni ponctuation : « Russian-speaking » → « russian speaking ». */
export function normaliserMorceau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Morceaux d'une zone : séparés par +, virgule, /, &, ; ou « et » / « and ». */
export function morceauxDeZone(zone: string): string[] {
  return zone
    .split(/\s*(?:\+|,|\/|&|;|\bet\b|\band\b)\s*/i)
    .map((m) => m.trim())
    .filter(Boolean);
}

export interface PaysDeZone {
  /** Noms du fond de carte, sans doublon, dans l'ordre de la zone. */
  pays: string[];
  /** Morceaux non placés (tels qu'écrits). */
  inconnus: string[];
}

/**
 * Pays d'une zone. `nomsCarte` (les noms du fond de carte) permet de placer
 * tout pays écrit comme Natural Earth l'écrit, sans alias.
 */
export function paysDeZone(zone: string, nomsCarte: Iterable<string> = []): PaysDeZone {
  const parNom = new Map<string, string>();
  for (const n of nomsCarte) parNom.set(normaliserMorceau(n), n);
  const pays: string[] = [];
  const inconnus: string[] = [];
  for (const morceau of morceauxDeZone(zone)) {
    const cle = normaliserMorceau(morceau);
    const trouves = ALIAS[cle] ?? (parNom.has(cle) ? [parNom.get(cle) as string] : null);
    if (!trouves) {
      inconnus.push(morceau);
      continue;
    }
    for (const p of trouves) if (!pays.includes(p)) pays.push(p);
  }
  return { pays, inconnus };
}

/** Ce que la carte sait d'une zone (calculé par la page, filtres ignorés). */
export interface ZoneCarte {
  cle: string;
  zone: string;
  /** Créateurs de la zone, par phase. */
  compteurs: { total: number; pasCree: number; warmup: number; actif: number };
  recruteurs: Array<{
    id: string;
    nom: string;
    role: string | null;
    photoUrl: string | null;
    actif: boolean;
    createurs: number;
  }>;
}

export interface Carte {
  /** Pays → clés des zones qui le couvrent (deux zones peuvent se partager un pays). */
  zonesParPays: Map<string, string[]>;
  /** Zone → ses pays placés. */
  paysParZone: Map<string, string[]>;
  /** Zones dont au moins un morceau n'est pas placé. */
  nonPlacees: Array<{ cle: string; zone: string; inconnus: string[] }>;
  /** Plus grand nombre de créateurs d'une zone (échelle du dégradé). */
  max: number;
}

export function construireCarte(zones: readonly ZoneCarte[], nomsCarte: Iterable<string> = []): Carte {
  const noms = [...nomsCarte];
  const zonesParPays = new Map<string, string[]>();
  const paysParZone = new Map<string, string[]>();
  const nonPlacees: Carte["nonPlacees"] = [];
  let max = 0;
  for (const z of zones) {
    const { pays, inconnus } = paysDeZone(z.zone, noms);
    paysParZone.set(z.cle, pays);
    if (inconnus.length > 0) nonPlacees.push({ cle: z.cle, zone: z.zone, inconnus });
    for (const p of pays) zonesParPays.set(p, [...(zonesParPays.get(p) ?? []), z.cle]);
    max = Math.max(max, z.compteurs.total);
  }
  return { zonesParPays, paysParZone, nonPlacees, max };
}

/** Nombre de paliers du dégradé (hors palier 0 : zone sans créateur). */
export const PALIERS = 5;

/** Palier de couleur d'une zone : 0 sans créateur, puis 1..PALIERS selon le max. */
export function palierZone(total: number, max: number): number {
  if (total <= 0 || max <= 0) return 0;
  return Math.min(PALIERS, Math.max(1, Math.ceil((total / max) * PALIERS)));
}
