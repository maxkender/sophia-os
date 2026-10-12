/**
 * Guichet du site (Sophia Culture Hub, Lovable) vers l'OS : décisions pures.
 *
 * Le site recrute des posters slideshow (formulaire public, acceptation à la
 * main, contrat signé en ligne). Une fois le contrat signé, il appelle la
 * fonction `hub-posteurs` pour créer le poster ici. Ce module décide, sans
 * toucher à la base :
 *
 *   - quel HM reçoit le poster : celui dont `profiles.zone_recrutement`
 *     (texte libre de la master list : « Spain + Portugal », « US + UK »…)
 *     couvre son pays. Pas de HM pour le pays = zone pas encore ouverte dans
 *     l'OS : on refuse, le site garde la candidature en attente ;
 *   - dans quelle langue il publie : la langue du PAYS, pas celle des emails
 *     choisie sur le formulaire (un Polonais peut lire nos emails en anglais
 *     et publier en polonais). Elle doit figurer dans les `langues` du HM ;
 *   - la répartition d'applications du compte (Sophia, UnSwipe, ou les deux).
 */

/** ISO 3166-1 alpha-2, la même liste que le site (src/config/countries.ts). */
const CODES_ISO =
  "AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TC TV UG UA AE GB US UY UZ VU VA VE VN VG VI YE ZM ZW"
    .split(" ");

/**
 * Abréviations et variantes de la master list, en codes ISO. Aligné sur
 * `ALIAS` de src/features/hiring/carteZones.ts (la carte des zones), qui
 * travaille en noms du fond de carte : un pays qui s'ajoute là s'ajoute ici.
 */
const ALIAS_ISO: Record<string, readonly string[]> = {
  us: ["US"],
  usa: ["US"],
  "united states": ["US"],
  "united states of america": ["US"],
  "etats unis": ["US"],
  uk: ["GB"],
  "great britain": ["GB"],
  england: ["GB"],
  "royaume uni": ["GB"],
  uae: ["AE"],
  emirates: ["AE"],
  "emirats arabes unis": ["AE"],
  nz: ["NZ"],
  "czech republic": ["CZ"],
  turkey: ["TR"],
  holland: ["NL"],
  korea: ["KR"],
  "south korea": ["KR"],
  // Les créateurs russophones : pas un pays, les trois grands pays russophones
  // (même choix que la carte).
  "russian speaking": ["RU", "BY", "KZ"],
  russophone: ["RU", "BY", "KZ"],
  russophones: ["RU", "BY", "KZ"],
};

/**
 * Langue de publication d'un pays, en codes de langue de l'OS (`comptes.langue`).
 * Les pays à plusieurs langues sans majorité nette (Belgique, Suisse,
 * Luxembourg, Maroc…) n'y sont volontairement pas : mieux vaut un refus clair
 * (`langue_non_geree`) qu'un compte qui publie dans la mauvaise langue.
 */
export const LANGUE_PAR_PAYS: Readonly<Record<string, string>> = {
  FR: "fr", MC: "fr",
  DE: "de", AT: "de", LI: "de",
  IT: "it", SM: "it",
  ES: "es", MX: "es", CO: "es", AR: "es", CL: "es", PE: "es", EC: "es", CR: "es",
  UY: "es", VE: "es", BO: "es", PY: "es", GT: "es", DO: "es", HN: "es", NI: "es",
  PA: "es", SV: "es",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
  NL: "nl", PL: "pl", RO: "ro", MD: "ro", HU: "hu", CZ: "cs", SK: "sk", BG: "bg",
  GR: "el", CY: "el", HR: "hr", SI: "sl", RS: "sr",
  SE: "sv", NO: "no", DK: "da", FI: "fi", EE: "et", LV: "lv", LT: "lt",
  TR: "tr", IL: "he", AE: "ar", SA: "ar", EG: "ar",
  RU: "ru", BY: "ru", KZ: "ru", UA: "uk",
  US: "en", GB: "en", IE: "en", AU: "en", NZ: "en", CA: "en",
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

let indexNoms: Map<string, string> | null = null;

/** Nom normalisé (anglais ou français, via Intl) → code ISO. Construit une fois. */
function indexDesNoms(): Map<string, string> {
  if (indexNoms) return indexNoms;
  const index = new Map<string, string>();
  for (const locale of ["en", "fr"]) {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      dn = null;
    }
    if (!dn) continue;
    for (const code of CODES_ISO) {
      const nom = dn.of(code);
      if (nom) {
        const cle = normaliserMorceau(nom);
        if (!index.has(cle)) index.set(cle, code);
      }
    }
  }
  indexNoms = index;
  return index;
}

/** Codes ISO d'un morceau de zone (« UK », « Czechia », « Russian-speaking »…). */
export function codesDuMorceau(morceau: string): string[] {
  const cle = normaliserMorceau(morceau);
  if (!cle) return [];
  const alias = ALIAS_ISO[cle];
  if (alias) return [...alias];
  if (/^[a-z]{2}$/.test(cle) && CODES_ISO.includes(cle.toUpperCase())) return [cle.toUpperCase()];
  const code = indexDesNoms().get(cle);
  return code ? [code] : [];
}

/** Une zone découpée en codes ISO ; les morceaux qu'on ne sait pas placer sont rendus à part. */
export function codesDeZone(zone: string | null | undefined): { codes: string[]; inconnus: string[] } {
  const codes = new Set<string>();
  const inconnus: string[] = [];
  for (const morceau of String(zone ?? "").split(/[+,/;&]/)) {
    if (!morceau.trim()) continue;
    const trouves = codesDuMorceau(morceau);
    if (trouves.length === 0) inconnus.push(morceau.trim());
    for (const c of trouves) codes.add(c);
  }
  return { codes: [...codes], inconnus };
}

/** Code ISO d'un pays reçu du site : code à deux lettres de préférence, nom en repli. */
export function codePays(code: unknown, nom: unknown): string | null {
  const c = String(code ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c) && CODES_ISO.includes(c)) return c;
  const parNom = codesDuMorceau(String(nom ?? ""));
  return parNom.length === 1 ? parNom[0] : null;
}

export interface Recruteur {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  zone_recrutement: string | null;
  langues: string[] | null;
  /** Créateurs actifs déjà rattachés : départage deux HM d'un même pays. */
  posters_actifs: number;
}

export type Affectation =
  | { ok: true; hm: Recruteur; langue: string }
  | { ok: false; raison: "zone_non_ouverte" }
  | { ok: false; raison: "langue_non_geree"; langue: string | null; hm: Recruteur };

/**
 * HM et langue de publication d'un nouveau poster.
 *
 * Plusieurs HM couvrent le pays : on préfère celui qui gère la langue, puis le
 * moins chargé, puis l'email (ordre stable, même réponse à chaque rejeu).
 */
export function resoudreAffectation(paysCode: string, recruteurs: Recruteur[]): Affectation {
  const candidats = recruteurs
    .filter((r) => codesDeZone(r.zone_recrutement).codes.includes(paysCode))
    .sort((a, b) =>
      a.posters_actifs - b.posters_actifs ||
      String(a.email ?? "").localeCompare(String(b.email ?? ""))
    );
  if (candidats.length === 0) return { ok: false, raison: "zone_non_ouverte" };

  const langue = LANGUE_PAR_PAYS[paysCode] ?? null;
  const gere = langue ? candidats.find((r) => (r.langues ?? []).includes(langue)) : undefined;
  if (!langue || !gere) return { ok: false, raison: "langue_non_geree", langue, hm: candidats[0] };
  return { ok: true, hm: gere, langue };
}

/** Pays couverts par au moins un HM, ouverts ou non (langue pas gérée), pour le bouton « Accepter » du site. */
export function carteDesZones(recruteurs: Recruteur[]): {
  ouverts: { pays_code: string; langue: string; hm_id: string }[];
  fermes: { pays_code: string; raison: string; langue: string | null }[];
  inconnus: string[];
} {
  const pays = new Set<string>();
  const inconnus = new Set<string>();
  for (const r of recruteurs) {
    const { codes, inconnus: perdus } = codesDeZone(r.zone_recrutement);
    codes.forEach((c) => pays.add(c));
    perdus.forEach((m) => inconnus.add(m));
  }
  const ouverts: { pays_code: string; langue: string; hm_id: string }[] = [];
  const fermes: { pays_code: string; raison: string; langue: string | null }[] = [];
  for (const code of [...pays].sort()) {
    const a = resoudreAffectation(code, recruteurs);
    if (a.ok) ouverts.push({ pays_code: code, langue: a.langue, hm_id: a.hm.id });
    else fermes.push({ pays_code: code, raison: a.raison, langue: a.raison === "langue_non_geree" ? a.langue : null });
  }
  return { ouverts, fermes, inconnus: [...inconnus].sort() };
}

/** Applications que le site sait demander. */
export const APPLICATIONS_HUB = ["sophia", "unswipe"] as const;

/**
 * Répartition envoyée à manage-users (`parts_applications`).
 * Sophia seule → `null` : le chemin historique de création, inchangé.
 */
export function partsPourApplications(applications: unknown): Record<string, number> | null {
  const liste = Array.isArray(applications) ? applications : [];
  const voulues = [...new Set(liste.map((a) => String(a ?? "").trim().toLowerCase()))]
    .filter((a): a is (typeof APPLICATIONS_HUB)[number] => (APPLICATIONS_HUB as readonly string[]).includes(a));
  if (voulues.length === 0 || (voulues.length === 1 && voulues[0] === "sophia")) return null;
  if (voulues.length === 1) return { [voulues[0]]: 100 };
  return { sophia: 50, unswipe: 50 };
}

/** Sans 0/O, 1/l/I : un mot de passe recopié depuis un email ne doit pas piéger. */
const ALPHABET_MDP = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Mot de passe provisoire (12 caractères, tirage sans biais). Changé à la première connexion. */
export function genererMotDePasse(longueur = 12): string {
  const n = ALPHABET_MDP.length;
  const plafond = 256 - (256 % n);
  let mdp = "";
  while (mdp.length < longueur) {
    const octets = crypto.getRandomValues(new Uint8Array(longueur * 2));
    for (const o of octets) {
      if (o < plafond && mdp.length < longueur) mdp += ALPHABET_MDP[o % n];
    }
  }
  return mdp;
}

/** Comparaison du secret en temps constant (empreintes de même longueur). */
export async function secretValide(recu: string | null, attendu: string): Promise<boolean> {
  if (!recu || !attendu) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recu)),
    crypto.subtle.digest("SHA-256", enc.encode(attendu)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** « 2026-10-19 » valide (date réelle), sinon null. */
export function dateIso(v: unknown): string | null {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** Une réservation plus vieille que ça vient d'un appel mort en route : on la reprend. */
export const RESERVATION_PERIMEE_MS = 5 * 60_000;

export function reservationPerimee(reserveAt: string | null | undefined, maintenant = Date.now()): boolean {
  const t = reserveAt ? new Date(reserveAt).getTime() : NaN;
  return !Number.isFinite(t) || maintenant - t > RESERVATION_PERIMEE_MS;
}
