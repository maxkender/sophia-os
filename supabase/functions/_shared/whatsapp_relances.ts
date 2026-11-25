/**
 * WhatsApp — les relances automatiques (22/11, Max), la partie sans réseau ni base (testée dans
 * whatsapp_relances_test.ts). En plus des emails, jamais à leur place.
 *
 * 25/11 (Max) : les modèles v2 (whatsapp_modeles_v2.ts), avec repli sur l'ancien modèle tant que le v2 n'est pas
 * APPROVED chez Meta :
 *
 *   contract_to_sign     contrat pas signé : J+1 et J+3 après l'acceptation (jours du calendrier, heure du pays)
 *   welcome_start        posteur créé HORS Join (Hub, Upwork), 10 jours au plus avant son lundi, warm-up pas lancé,
 *                        une fois (repli : account_ready). Join envoie sa propre bienvenue (même clé welcome:<poster>).
 *   account_ready        jamais connecté 24 h après la signature (une fois, dans les 7 jours)
 *   start_posting_today  (nouveau) le lundi de début : warm-up fini, compte prêt, des posts du jour, jamais posté ;
 *                        une fois, avec la vidéo (pas de repli)
 *   warmup_start         warm-up pas lancé le jeudi avant le lundi de la cohorte, avec la niche (repli : warmup_reminder)
 *   ruul_payment_setup   Ruul pas READY 3 jours après le premier post (repli : ruul_setup)
 *   no_posts_week        le jeudi : 0 post, ou moins de la moitié des posts prévus depuis lundi (repli : no_posts_this_week)
 *
 * Garde-fous : refusRelance (accord, arrêt et « ne plus contacter », absence, panne, 1/jour, 4/semaine, 9 h – 21 h,
 * mode test). Les modèles n'existent qu'en anglais : tout part en anglais.
 */
import { heureOk as heureOkPays, fuseauDuPays, paysDuNumero, refusRelance } from "./whatsapp.ts";
import { DASHBOARD_V2 } from "./whatsapp_modeles_v2.ts";

export const LIEN_DASHBOARD_WA = DASHBOARD_V2;
export const LIEN_SITE_WA = "https://vik-studios-creators.com";
/** La vidéo guide (la même que VIDEO_GUIDE_URL de join.ts, gardée ici pour éviter un import circulaire). */
export const VIDEO_GUIDE_WA = "https://drive.google.com/file/d/10SuGjYGgOtLuW8WkOht1XPbyiM2z9fQi/view?usp=sharing";
/** La niche quand le compte n'en a pas (pas de compte perso, pas de label). */
export const NICHE_GENERIQUE = "your topic";

export const TYPES_RELANCE = [
  "contract_to_sign", "welcome_start", "account_ready", "start_posting_today", "warmup_start", "ruul_payment_setup", "no_posts_week",
] as const;
export type TypeRelance = (typeof TYPES_RELANCE)[number];

/** L'ordre de priorité quand plusieurs relances seraient dues le même jour (une seule par jour). */
export const ORDRE_RELANCES: readonly TypeRelance[] = TYPES_RELANCE;

/** Le modèle v2 de chaque relance et son repli (ancien modèle, 2 variables : prénom, lien). */
export const REPLIS: Record<TypeRelance, { nom: string; lien: string } | null> = {
  contract_to_sign: null,
  welcome_start: { nom: "account_ready", lien: LIEN_DASHBOARD_WA },
  account_ready: null,
  start_posting_today: null,
  warmup_start: { nom: "warmup_reminder", lien: LIEN_DASHBOARD_WA },
  ruul_payment_setup: { nom: "ruul_setup", lien: `${LIEN_DASHBOARD_WA}/ruul` },
  no_posts_week: { nom: "no_posts_this_week", lien: LIEN_DASHBOARD_WA },
};

/** Les anciens motifs qui valent pour la relance (une relance déjà partie sous l'ancien nom ne repart pas). */
const ANCIENS: Partial<Record<TypeRelance, string[]>> = {
  warmup_start: ["warmup_reminder"],
  ruul_payment_setup: ["ruul_setup"],
};

/** Une ligne de whatsapp_relances_faits() (0839), complétée par la fonction whatsapp (comptes, niche). */
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
  /** Vrai aussi pour la liste « ne plus contacter » (ne_plus_contacter non levé). */
  arrete: boolean;
  absent: boolean;
  panne: boolean;
  envois_jour: number;
  envois_semaine: number;
  /** Les motifs « relance:<type> » déjà partis à ce numéro / ce posteur. */
  deja: string[] | null;
  /** Ajouté par la fonction whatsapp : le @ du 1er compte perso actif (créé par l'OS). */
  handle?: string | null;
  /** Ajouté par la fonction whatsapp : warm-up du compte perso terminé (warmup_ends_at passé). */
  warmup_fini?: boolean | null;
  /** Ajouté par la fonction whatsapp pour warmup_start : la niche du compte (null : générique). */
  niche?: string | null;
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

/** « Monday 30 November » (anglais). */
export function lundiTexte(jour: string): string {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** L'échéance avant le lundi : « Sunday 29 November at midnight (Paris time) ». */
export function echeanceTexte(lundi: string): string {
  const veille = new Date(Date.parse(`${lundi}T12:00:00Z`) - JOUR).toISOString().slice(0, 10);
  return `${lundiTexte(veille)} at midnight (Paris time)`;
}

const deja = (f: FaitsRelance, type: TypeRelance) =>
  [type, ...(ANCIENS[type] ?? [])].some((t) => (f.deja ?? []).includes(`relance:${t}`));

/**
 * Les relances dues pour ce numéro aujourd'hui (avant les garde-fous), dans l'ordre de priorité. Le jour de la
 * semaine, l'heure et les écarts en jours se lisent dans le fuseau du pays du posteur.
 */
export function relancesDues(f: FaitsRelance, maintenant = new Date()): TypeRelance[] {
  const pays = paysRelance(f);
  const auj = dateLocale(pays, maintenant);
  const jour = jourSemaineLocal(pays, maintenant);
  const t = maintenant.getTime();
  const dues = new Set<TypeRelance>();

  // 1. Contrat pas signé : J+1 et J+3 après l'acceptation (pas désinscrit, pas expiré).
  if (f.accepte_at && !f.signe_at && !f.desinscrit_at && (!f.expire_at || Date.parse(f.expire_at) > t)) {
    const j = joursEntre(dateLocale(pays, new Date(f.accepte_at)), auj);
    if (j === 1 || j === 3) dues.add("contract_to_sign");
  }

  // 2. Bienvenue des posteurs créés hors Join (Join envoie la sienne) : 1 à 10 jours avant le lundi, warm-up pas lancé.
  if (f.poster_id && f.statut_site !== "join_signed" && f.cohorte_lundi && f.handle && !f.warmup_started_at &&
    !deja(f, "welcome_start")) {
    const avant = joursEntre(auj, f.cohorte_lundi);
    if (avant >= 1 && avant <= 10) dues.add("welcome_start");
  }

  // 3. Signé, jamais connecté 24 h après la signature (une fois, seulement dans les 7 jours qui suivent).
  if (f.poster_id && f.signe_at && !f.premiere_connexion_at && !deja(f, "account_ready")) {
    const depuis = t - Date.parse(f.signe_at);
    if (depuis >= JOUR && depuis < 7 * JOUR) dues.add("account_ready");
  }

  // 4. Le lundi de début : prêt (warm-up fini, compte créé), des posts du jour, jamais posté. Une fois.
  if (f.poster_id && jour === 1 && f.cohorte_lundi && f.cohorte_lundi <= auj && joursEntre(f.cohorte_lundi, auj) <= 21 &&
    !f.premier_post_at && f.prevus_a_date > 0 && f.warmup_fini === true && f.handle && !deja(f, "start_posting_today")) {
    dues.add("start_posting_today");
  }

  // 5. Le jeudi avant le lundi de la cohorte, warm-up pas lancé.
  if (f.poster_id && jour === 4 && f.cohorte_lundi && !f.warmup_started_at && !deja(f, "warmup_start")) {
    if (joursEntre(auj, f.cohorte_lundi) === 4) dues.add("warmup_start");
  }

  // 6. Ruul pas READY 3 jours après le premier post (une fois, dans les 10 jours).
  if (f.poster_id && f.canal_paie === "ruul" && f.premier_post_at && f.ruul_onboarding !== "READY" && !f.ruul_ready_at &&
    !deja(f, "ruul_payment_setup")) {
    const depuis = t - Date.parse(f.premier_post_at);
    if (depuis >= 3 * JOUR && depuis < 10 * JOUR) dues.add("ruul_payment_setup");
  }

  // 7. Le jeudi : cohorte commencée, des posts prévus depuis lundi, 0 publié ou moins de la moitié.
  if (f.poster_id && jour === 4 && f.cohorte_lundi && joursEntre(f.cohorte_lundi, auj) >= 3 && f.prevus_a_date > 0 &&
    f.publies_semaine * 2 < f.prevus_a_date) {
    dues.add("no_posts_week");
  }

  return ORDRE_RELANCES.filter((x) => dues.has(x));
}

/** Le modèle à envoyer (v2, ou son repli s'il n'est pas APPROVED) et ses variables ; null : aucun modèle utilisable. */
export function modeleRelance(
  type: TypeRelance, f: FaitsRelance, approuves?: ReadonlySet<string>,
): { nom: string; langue: string; variables: string[] } | null {
  const prenom = (f.prenom ?? "").trim().split(/\s+/)[0] || "there";
  const ok = (nom: string) => !approuves || approuves.has(nom);
  const lundi = f.cohorte_lundi ?? "";
  const v2: Record<TypeRelance, string[]> = {
    contract_to_sign: [prenom, LIEN_SITE_WA],
    welcome_start: [prenom, lundi ? lundiTexte(lundi) : "", lundi ? echeanceTexte(lundi) : "", f.handle ?? "", VIDEO_GUIDE_WA],
    account_ready: [prenom, LIEN_DASHBOARD_WA],
    start_posting_today: [prenom, VIDEO_GUIDE_WA],
    warmup_start: [prenom, lundi ? lundiTexte(lundi) : "", (f.niche ?? "").trim() || NICHE_GENERIQUE, lundi ? echeanceTexte(lundi) : ""],
    ruul_payment_setup: [prenom],
    no_posts_week: [prenom],
  };
  if (ok(type) && v2[type].every((x) => x)) return { nom: type, langue: "en", variables: v2[type] };
  const repli = REPLIS[type];
  if (repli && ok(repli.nom)) return { nom: repli.nom, langue: "en", variables: [prenom, repli.lien] };
  return null;
}

export interface DecisionRelance {
  type: TypeRelance;
  cle: string;
  motif: string;
  refus: string | null;
  modele: { nom: string; langue: string; variables: string[] } | null;
}

/** La clé anti-doublon de la bienvenue, partagée avec Join : jamais deux bienvenues WhatsApp au même posteur. */
export const cleBienvenue = (posterId: string) => `welcome:${posterId}`;

/**
 * La relance à faire pour ce numéro (la première due), garde-fous compris : `refus` dit pourquoi elle ne part pas.
 * null : rien n'est dû aujourd'hui. `approuves` : les modèles APPROVED chez Meta (absent : tous supposés approuvés).
 */
export function deciderRelance(
  f: FaitsRelance, o: { modeAutorise: boolean; maintenant?: Date; approuves?: ReadonlySet<string> },
): DecisionRelance | null {
  const maintenant = o.maintenant ?? new Date();
  const [type] = relancesDues(f, maintenant);
  if (!type) return null;
  const pays = paysRelance(f);
  const modele = modeleRelance(type, f, o.approuves);
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
  }) ?? (modele ? null : "modèle pas approuvé chez Meta");
  const qui = f.poster_id ?? `site-${f.site_id ?? f.contact_id}`;
  return {
    type,
    cle: type === "welcome_start" && f.poster_id ? cleBienvenue(f.poster_id) : `relance:${type}:${qui}:${dateLocale(pays, maintenant)}`,
    motif: `relance:${type}`,
    refus,
    modele,
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
