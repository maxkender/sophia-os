/**
 * WhatsApp — les relances automatiques (22/11, Max), la partie sans réseau ni base (testée dans
 * whatsapp_relances_test.ts). En plus des emails, jamais à leur place.
 *
 *   contract_to_sign    contrat pas signé : J+1 et J+3 après l'acceptation (jours du calendrier, heure du pays)
 *   account_ready       jamais connecté 24 h après la signature (une fois, dans les 7 jours)
 *   warmup_reminder     warm-up pas lancé le jeudi avant le lundi de la cohorte (une fois)
 *   no_posts_this_week  le jeudi : 0 post, ou moins de la moitié des posts prévus depuis lundi
 *   ruul_setup          Ruul pas READY 3 jours après le premier post (une fois, dans les 10 jours)
 *
 * Garde-fous : refusRelance (accord, arrêt, absence, panne, 1/jour, 4/semaine, 9 h – 21 h, mode test).
 * Les modèles sont en anglais (2 variables : prénom, lien).
 */
import { heureOk as heureOkPays, fuseauDuPays, MODELES, type NomModele, paysDuNumero, refusRelance } from "./whatsapp.ts";

export const LIEN_DASHBOARD_WA = "https://sophia-marketing-orga.vercel.app";
export const LIEN_SITE_WA = "https://vik-studios-creators.com";

/** Le lien (2e variable) de chaque modèle. */
export const LIENS_RELANCE: Record<NomModele, string> = {
  contract_to_sign: LIEN_SITE_WA,
  account_ready: LIEN_DASHBOARD_WA,
  warmup_reminder: LIEN_DASHBOARD_WA,
  no_posts_this_week: LIEN_DASHBOARD_WA,
  ruul_setup: `${LIEN_DASHBOARD_WA}/ruul`,
};

/** L'ordre de priorité quand plusieurs relances seraient dues le même jour (une seule par jour). */
export const ORDRE_RELANCES: readonly NomModele[] = ["contract_to_sign", "account_ready", "warmup_reminder", "ruul_setup", "no_posts_this_week"];

/** Une ligne de whatsapp_relances_faits() (0839). */
export interface FaitsRelance {
  contact_id: string;
  poster_id: string | null;
  site_id: string | null;
  e164: string;
  optin_at: string | null;
  optout_at: string | null;
  prenom: string | null;
  pays: string | null;
  accepte_at: string | null;
  signe_at: string | null;
  desinscrit_at: string | null;
  expire_at: string | null;
  statut_site: string | null;
  is_active: boolean | null;
  premiere_connexion_at: string | null;
  cohorte_lundi: string | null;
  canal_paie: string | null;
  ruul_onboarding: string | null;
  ruul_ready_at: string | null;
  warmup_started_at: string | null;
  premier_post_at: string | null;
  prevus_a_date: number;
  publies_semaine: number;
  arrete: boolean;
  absent: boolean;
  panne: boolean;
  envois_jour: number;
  envois_semaine: number;
  /** Les motifs « relance:<type> » déjà partis à ce numéro / ce posteur. */
  deja: string[] | null;
}

const JOUR = 24 * 3600_000;

/** Le pays retenu : celui de la fiche (code ISO à 2 lettres), sinon celui de l'indicatif du numéro. */
export function paysRelance(f: Pick<FaitsRelance, "pays" | "e164">): string | null {
  const p = String(f.pays ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) ? p : paysDuNumero(f.e164);
}

/** La date du jour (AAAA-MM-JJ) dans le fuseau du pays. */
export function dateLocale(pays: string | null | undefined, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuseauDuPays(pays), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Le jour de la semaine (1 = lundi … 7 = dimanche) dans le fuseau du pays. */
export function jourSemaineLocal(pays: string | null | undefined, at: Date): number {
  const d = new Date(`${dateLocale(pays, at)}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Le nombre de jours du calendrier entre deux dates AAAA-MM-JJ (b - a). */
export function joursEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / JOUR);
}

const deja = (f: FaitsRelance, type: NomModele) => (f.deja ?? []).includes(`relance:${type}`);

/**
 * Les relances dues pour ce numéro aujourd'hui (avant les garde-fous), dans l'ordre de priorité. Le jeudi, l'heure et
 * les écarts en jours se lisent dans le fuseau du pays du posteur.
 */
export function relancesDues(f: FaitsRelance, maintenant = new Date()): NomModele[] {
  const pays = paysRelance(f);
  const auj = dateLocale(pays, maintenant);
  const jeudi = jourSemaineLocal(pays, maintenant) === 4;
  const t = maintenant.getTime();
  const dues = new Set<NomModele>();

  // 1. Contrat pas signé : J+1 et J+3 après l'acceptation (pas désinscrit, pas expiré).
  if (f.accepte_at && !f.signe_at && !f.desinscrit_at && (!f.expire_at || Date.parse(f.expire_at) > t)) {
    const j = joursEntre(dateLocale(pays, new Date(f.accepte_at)), auj);
    if (j === 1 || j === 3) dues.add("contract_to_sign");
  }

  // 2. Signé, jamais connecté 24 h après la signature (une fois, seulement dans les 7 jours qui suivent).
  if (f.poster_id && f.signe_at && !f.premiere_connexion_at && !deja(f, "account_ready")) {
    const depuis = t - Date.parse(f.signe_at);
    if (depuis >= JOUR && depuis < 7 * JOUR) dues.add("account_ready");
  }

  // 3. Le jeudi avant le lundi de la cohorte, warm-up pas lancé.
  if (f.poster_id && jeudi && f.cohorte_lundi && !f.warmup_started_at && !deja(f, "warmup_reminder")) {
    if (joursEntre(auj, f.cohorte_lundi) === 4) dues.add("warmup_reminder");
  }

  // 4. Ruul pas READY 3 jours après le premier post (une fois, dans les 10 jours).
  if (f.poster_id && f.canal_paie === "ruul" && f.premier_post_at && f.ruul_onboarding !== "READY" && !f.ruul_ready_at &&
    !deja(f, "ruul_setup")) {
    const depuis = t - Date.parse(f.premier_post_at);
    if (depuis >= 3 * JOUR && depuis < 10 * JOUR) dues.add("ruul_setup");
  }

  // 5. Le jeudi : cohorte commencée, des posts prévus depuis lundi, 0 publié ou moins de la moitié.
  if (f.poster_id && jeudi && f.cohorte_lundi && joursEntre(f.cohorte_lundi, auj) >= 3 && f.prevus_a_date > 0 &&
    f.publies_semaine * 2 < f.prevus_a_date) {
    dues.add("no_posts_this_week");
  }

  return ORDRE_RELANCES.filter((x) => dues.has(x));
}

export interface DecisionRelance {
  type: NomModele;
  cle: string;
  motif: string;
  refus: string | null;
  modele: { nom: NomModele; langue: string; variables: string[] };
}

/**
 * La relance à faire pour ce numéro (la première due), garde-fous compris : `refus` dit pourquoi elle ne part pas.
 * null : rien n'est dû aujourd'hui.
 */
export function deciderRelance(f: FaitsRelance, o: { modeAutorise: boolean; maintenant?: Date }): DecisionRelance | null {
  const maintenant = o.maintenant ?? new Date();
  const [type] = relancesDues(f, maintenant);
  if (!type) return null;
  const pays = paysRelance(f);
  const refus = refusRelance({
    modeAutorise: o.modeAutorise,
    optin: !!f.optin_at,
    optout: !!f.optout_at,
    arrete: !!f.arrete,
    absent: !!f.absent,
    panne: !!f.panne,
    envoisJour: f.envois_jour ?? 0,
    envoisSemaine: f.envois_semaine ?? 0,
    heureOk: heureOkPays(pays, maintenant),
  });
  const qui = f.poster_id ?? `site-${f.site_id ?? f.contact_id}`;
  const prenom = (f.prenom ?? "").trim().split(/\s+/)[0] || "there";
  const variables = [prenom, LIENS_RELANCE[type]].slice(0, MODELES[type]);
  return {
    type,
    cle: `relance:${type}:${qui}:${dateLocale(pays, maintenant)}`,
    motif: `relance:${type}`,
    refus,
    modele: { nom: type, langue: "en", variables },
  };
}

// ------------------------------------------------------------------------------------------------------------------
// Le pied des emails (préparé, PAS activé : derrière le réglage whatsapp_banniere, éteint par défaut).
// ------------------------------------------------------------------------------------------------------------------

/** La phrase à ajouter au pied des prochains emails, quand Max allumera whatsapp_banniere. */
export const PHRASE_WHATSAPP_EMAIL =
  "Prefer WhatsApp? Add your number and agree to receive WhatsApp messages about your onboarding and posting on your dashboard.";

/**
 * Le texte d'un email avec la phrase WhatsApp au pied, seulement si `actif` (le réglage whatsapp_banniere) ;
 * sinon le texte est rendu tel quel, sans aucun changement.
 */
export function avecPiedWhatsApp(texte: string, actif: boolean): string {
  if (!actif) return texte;
  const t = texte.trimEnd();
  if (!t || t.includes(PHRASE_WHATSAPP_EMAIL)) return texte;
  return `${t}\n\n${PHRASE_WHATSAPP_EMAIL}`;
}

/** Le réglage whatsapp_banniere lu depuis sa valeur jsonb (true, ou { actif: true }). */
export function banniereActive(valeur: unknown): boolean {
  if (valeur === true) return true;
  return typeof valeur === "object" && valeur !== null && (valeur as { actif?: unknown }).actif === true;
}
