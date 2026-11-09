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
const AMERIQUE_LATINE = [
  "MX", "GT", "HN", "SV", "NI", "CR", "PA", "CU", "DO", "CO", "VE", "EC", "PE", "BO", "PY", "CL", "AR", "UY",
] as const;

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
  // L'Amérique latine hispanophone (es-419), sans le Brésil : même liste que
  // la carte.
  "latin america": AMERIQUE_LATINE,
  "amerique latine": AMERIQUE_LATINE,
  latam: AMERIQUE_LATINE,
};

/**
 * Langue de publication d'un pays, en codes de langue de l'OS (`comptes.langue`).
 * Les pays à plusieurs langues sans majorité nette (Belgique, Suisse,
 * Luxembourg, Maroc…) n'y sont volontairement pas : le routage des HM
 * (`resoudreAffectation`) les refuse (`langue_non_geree`). Le site, lui, passe
 * par `langueDuPays`, qui répond toujours.
 */
export const LANGUE_PAR_PAYS: Readonly<Record<string, string>> = {
  FR: "fr", MC: "fr",
  DE: "de", AT: "de", LI: "de",
  IT: "it", SM: "it",
  ES: "es",
  // Amérique latine : es-419 et pt-BR, comme les comptes de l'OS
  // (src/features/moteur/pays.ts). En « es », le trigger comptes_pays_defaut
  // rangeait un poster mexicain en Espagne.
  MX: "es-419", CO: "es-419", AR: "es-419", CL: "es-419", PE: "es-419", EC: "es-419",
  CR: "es-419", UY: "es-419", VE: "es-419", BO: "es-419", PY: "es-419", GT: "es-419",
  DO: "es-419", HN: "es-419", NI: "es-419", PA: "es-419", SV: "es-419",
  PT: "pt", BR: "pt-BR", AO: "pt", MZ: "pt",
  NL: "nl", PL: "pl", RO: "ro", MD: "ro", HU: "hu", CZ: "cs", SK: "sk", BG: "bg",
  GR: "el", CY: "el", HR: "hr", SI: "sl", RS: "sr",
  SE: "sv", NO: "no", DK: "da", FI: "fi", EE: "et", LV: "lv", LT: "lt",
  TR: "tr", IL: "he", AE: "ar", SA: "ar", EG: "ar", LB: "ar",
  RU: "ru", BY: "ru", KZ: "ru", UA: "uk",
  US: "en", GB: "en", IE: "en", AU: "en", NZ: "en", CA: "en",
  JP: "ja",
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

/** Une ligne de `hm_pays` (0516) : la HM qui recrute ce pays, quand elle a un compte OS. */
export interface PaysRecrute {
  pays: string;
  hm_id: string | null;
}

/** Une ligne ACTIVE de `zones_paie_pays` (`retire_at` nul) : un pays ouvert dans l'OS. */
export interface PaysOuvert {
  pays: string;
  zone: string;
}

/** Langues des comptes déjà dans l'OS, par pays : `{ CH: { de: 2 } }`. */
export type LanguesComptes = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Langue des pays à plusieurs langues pour un poster du site, faute de comptes
 * dans l'OS pour trancher : celle de la HM qui couvre le pays (Sara, `fr`,
 * pour la Belgique).
 */
const LANGUE_SITE_PAR_DEFAUT: Readonly<Record<string, string>> = { BE: "fr", LU: "fr", CH: "de" };

/**
 * Langue de publication d'un poster du site : celle du pays
 * (`LANGUE_PAR_PAYS`), sinon le choix fixé pour les pays à plusieurs langues,
 * sinon la langue la plus fréquente des comptes du pays dans l'OS, sinon
 * l'anglais par défaut (`devinee: true` : la langue du pays n'est pas connue).
 * Toujours une réponse : un pays ouvert dans l'OS n'est jamais refusé pour sa
 * langue.
 */
export function langueDuPaysDetail(
  paysCode: string,
  languesComptes: LanguesComptes = {},
): { langue: string; devinee: boolean } {
  const connue = LANGUE_PAR_PAYS[paysCode] ?? LANGUE_SITE_PAR_DEFAUT[paysCode];
  if (connue) return { langue: connue, devinee: false };
  const [majoritaire] = Object.entries(languesComptes[paysCode] ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return majoritaire ? { langue: majoritaire[0], devinee: false } : { langue: "en", devinee: true };
}

export function langueDuPays(paysCode: string, languesComptes: LanguesComptes = {}): string {
  return langueDuPaysDetail(paysCode, languesComptes).langue;
}

export type AffectationSite =
  | { ok: true; hm: Recruteur | null; langue: string; zone: string }
  | { ok: false; raison: "zone_non_ouverte" };

/**
 * Affectation d'un poster du site (décision du 06/11) : **un pays est ouvert
 * au site si et seulement s'il est ouvert dans l'OS**, c'est-à-dire s'il a une
 * zone de paie active (`zones_paie_pays`, `retire_at` nul). Ni la zone d'une
 * HM ni `hm_pays` n'ouvrent ou ne ferment plus rien : le poster va dans la
 * cohorte Ruul. Un pays retiré (Portugal, 02/11) est fermé.
 *
 * La HM de la zone n'est plus qu'une information (page Posters du site) :
 * celle dont la zone couvre le pays, sinon celle de `hm_pays`, sinon aucune.
 */
export function resoudreAffectationSite(
  paysCode: string,
  paysOuverts: PaysOuvert[],
  recruteurs: Recruteur[],
  paysRecrutes: PaysRecrute[] = [],
  languesComptes: LanguesComptes = {},
): AffectationSite {
  const ouvert = paysOuverts.find((p) => p.pays === paysCode);
  if (!ouvert) return { ok: false, raison: "zone_non_ouverte" };
  const langue = langueDuPays(paysCode, languesComptes);
  const a = resoudreAffectation(paysCode, recruteurs);
  const idHmPays = paysRecrutes.find((p) => p.pays === paysCode)?.hm_id ?? null;
  const hm = a.ok || a.raison === "langue_non_geree" ? a.hm : recruteurs.find((r) => r.id === idHmPays) ?? null;
  return { ok: true, hm, langue, zone: ouvert.zone };
}

/**
 * La HM qui recrute dans ce pays (« À recruter » du samedi, 0364) : celle du
 * routage du site, même si la langue du pays n'y est pas encore gérée.
 */
export function hmDuPays(paysCode: string, recruteurs: Recruteur[]): string | null {
  const a = resoudreAffectation(paysCode, recruteurs);
  return a.ok || a.raison === "langue_non_geree" ? a.hm.id : null;
}

/**
 * Carte des pays pour le bouton « Accepter » du site : `ouverts` = tous les
 * pays ouverts dans l'OS (zone de paie active), avec leur langue de
 * publication, leur zone et leur HM de zone (`hm_id` nul sans HM).
 * `langue_os` : la langue du pays est connue (pas l'anglais par défaut) et des
 * comptes actifs de l'OS publient dans cette langue (`languesOs`) — c'est le
 * « valide » du bouton « Accept all valid » du site. Sans `languesOs`, seule
 * la première condition compte.
 * `fermes` = les pays d'une zone de HM ou de `hm_pays` qui n'ont pas de zone
 * de paie active, pour information.
 */
export function carteDesZones(
  paysOuverts: PaysOuvert[],
  recruteurs: Recruteur[] = [],
  paysRecrutes: PaysRecrute[] = [],
  languesComptes: LanguesComptes = {},
  languesOs: ReadonlySet<string> | null = null,
): {
  ouverts: { pays_code: string; langue: string; langue_os: boolean; zone: string; hm_id: string | null }[];
  fermes: { pays_code: string; raison: string; langue: string | null }[];
  inconnus: string[];
} {
  const ouverts: { pays_code: string; langue: string; langue_os: boolean; zone: string; hm_id: string | null }[] = [];
  for (const { pays } of [...paysOuverts].sort((a, b) => a.pays.localeCompare(b.pays))) {
    const a = resoudreAffectationSite(pays, paysOuverts, recruteurs, paysRecrutes, languesComptes);
    if (!a.ok) continue;
    const { devinee } = langueDuPaysDetail(pays, languesComptes);
    const langueOs = !devinee && (languesOs === null || languesOs.has(a.langue));
    ouverts.push({ pays_code: pays, langue: a.langue, langue_os: langueOs, zone: a.zone, hm_id: a.hm?.id ?? null });
  }
  const estOuvert = new Set(ouverts.map((o) => o.pays_code));
  const autres = new Set<string>(paysRecrutes.map((p) => p.pays));
  const inconnus = new Set<string>();
  for (const r of recruteurs) {
    const { codes, inconnus: perdus } = codesDeZone(r.zone_recrutement);
    codes.forEach((c) => autres.add(c));
    perdus.forEach((m) => inconnus.add(m));
  }
  const fermes = [...autres].filter((c) => !estOuvert.has(c)).sort()
    .map((pays_code) => ({ pays_code, raison: "zone_non_ouverte", langue: null }));
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

/**
 * Profil « RUUL cohort » auquel sont rattachés les posters du site, à la place
 * d'un HM (décision du 17/10) : réglage `hub_posteurs`, clé `cohorte_ruul_id`.
 * Absent ou illisible : null, et le poster revient au HM de sa zone.
 */
export function idCohorteRuul(valeur: unknown): string | null {
  const id = (valeur as { cohorte_ruul_id?: unknown } | null)?.cohorte_ruul_id;
  return estUuid(id) ? id.toLowerCase() : null;
}

/**
 * Langues qui ne désignent qu'un marché : le trigger `comptes_pays_defaut`
 * (migration 0281) en déduit le pays du compte. Copie des clés de
 * `PAYS_PAR_DEFAUT_LANGUE` (src/features/moteur/pays.ts), à garder alignée.
 */
const LANGUES_UN_SEUL_MARCHE = new Set([
  "fr", "de", "it", "es", "pt", "pt-BR", "cs", "nl", "el", "hu", "pl", "ro",
  "sv", "tr", "da", "no", "hr", "sl", "sk", "sr", "he", "fi", "et", "bg",
  "lt", "lv", "ja",
]);

/**
 * Pays à envoyer à manage-users, comme `paysAEnvoyer` côté front
 * (src/features/moteur/paysCompte.ts) : rien quand la langue suffit, le pays
 * du poster pour en, ar, ru… Sans lui, un compte anglais n'a pas de pays et
 * manque dans la table de recrutement.
 */
export function paysAEnvoyer(langue: string, paysCode: string): string | undefined {
  return LANGUES_UN_SEUL_MARCHE.has(langue) ? undefined : paysCode;
}

/**
 * Mot de passe de départ : le même que pour tous les comptes OS créés par
 * l'admin (`MDP_OS_INITIAL` côté front), sans changement imposé.
 */
export const MOT_DE_PASSE_INITIAL = "12345678";

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
