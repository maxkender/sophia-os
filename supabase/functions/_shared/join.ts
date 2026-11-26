/**
 * join — les règles pures de l'app « Join » (parcours posteur, 22/11, Max). Sans réseau ni base (testé dans
 * join_test.ts). La fonction Edge `join` ne fait que les appliquer. MODE TEST : rien ne part à de vrais posteurs.
 *
 * Les règles d'acceptation sont celles de l'OS : `manquesCandidature` et `lundiSuivant` de ruul.ts (importées,
 * jamais copiées).
 */
import { type CandidatureRuul, lundiSuivant, manquesCandidature } from "./ruul.ts";
import { guideRuul, LIEN_RUUL, PHRASE_QUESTION_OS } from "./parcours_ruul.ts";
import { DASHBOARD_V2, SLACK_V2 } from "./whatsapp_modeles_v2.ts";
import { dateLocale, joursEntre, jourSemaineLocal, type TypeRelance } from "./whatsapp_relances.ts";

/** 23/11 (Max) : l'identité légale de la société, affichée sur le site, en tête du contrat et dans les mentions légales. */
export const SOCIETE = {
  nom: "Vik Studios SAS",
  nom_commercial: "Vik Studios",
  forme: "société par actions simplifiée (SAS)",
  capital: "2 €",
  siren: "103 372 421",
  siret: "103 372 421 00018",
  rcs: "RCS Paris 103 372 421",
  tva: "FR30103372421",
  siege: "30 boulevard de Sébastopol, 75004 Paris, France",
  president: "Maximilien Kender",
  contact: "support@vikstudios.com",
} as const;

/** 23/11 (Max) : la vidéo guide (landing de Join, bienvenue ; plus tard WhatsApp et emails de l'OS). */
export const VIDEO_GUIDE_URL = "https://drive.google.com/file/d/10SuGjYGgOtLuW8WkOht1XPbyiM2z9fQi/view?usp=sharing";

/** Le lien d'invitation Slack des posteurs (le même que les modèles WhatsApp v2). */
export const LIEN_SLACK = SLACK_V2;
/** Le dashboard de l'OS (là où le posteur se connecte une fois son compte créé). */
export const LIEN_DASHBOARD_OS = DASHBOARD_V2;
/** La page Join (sa checklist personnelle). La fonction peut la remplacer (JOIN_URL) pour les liens des emails. */
export const JOIN_URL_PUBLIC = "https://join.vikstudios.com";
/** 25/11 : l'inscription Ruul quand il n'y a pas de lien personnel (le bouton « Create my Ruul account »). */
export const LIEN_INSCRIPTION_RUUL = LIEN_RUUL;
/** La création d'un compte TikTok (le bouton de l'étape TikTok). */
export const LIEN_TIKTOK = "https://www.tiktok.com/signup";

export const ETAPES_JOIN = ["tiktok", "profil", "warmup", "slack", "ruul"] as const;
export type EtapeJoin = (typeof ETAPES_JOIN)[number];
export const estEtapeJoin = (e: unknown): e is EtapeJoin => (ETAPES_JOIN as readonly unknown[]).includes(e);

export const CLES_REPONSES = ["pays_actuel", "heures", "tiktok", "contenu"] as const;

export const CONSENTEMENT =
  "I agree that Vik Studios stores this application and contacts me about it by email and WhatsApp.";

export const CONSENTEMENT_WHATSAPP = "I agree to receive WhatsApp messages about my onboarding and posting.";

export const CODE_ESSAIS_MAX = 5;
export const CODE_DUREE_MIN = 15;

// ---------------------------------------------------------------------------------------------------------------
// Mode (réglage join_mode)
// ---------------------------------------------------------------------------------------------------------------

export interface ModeJoin {
  mode: "test" | "live";
  testeurs_emails: string[];
  testeurs_whatsapp: string[];
  /** Nom du modèle WhatsApp d'authentification pour le code (vide : le code WhatsApp n'est pas envoyé). */
  modele_code: string | null;
}

/** Lit le réglage ; tout ce qui n'est pas explicitement « live » est du test. */
export function lireModeJoin(v: unknown): ModeJoin {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const liste = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    mode: o.mode === "live" ? "live" : "test",
    testeurs_emails: liste(o.testeurs_emails).map((e) => e.trim().toLowerCase()),
    testeurs_whatsapp: liste(o.testeurs_whatsapp).map((n) => n.replace(/[^\d+]/g, "")),
    modele_code: typeof o.modele_code === "string" && /^[a-z0-9_]{1,512}$/.test(o.modele_code) ? o.modele_code : null,
  };
}

/** En test, un email réel ne part que vers un testeur. */
export function emailAutorise(mode: ModeJoin, email: string): boolean {
  return mode.testeurs_emails.includes(email.trim().toLowerCase());
}

// ---------------------------------------------------------------------------------------------------------------
// Candidature
// ---------------------------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Format international E.164 : « + », puis 8 à 15 chiffres, sans zéro en tête. */
export function normaliserWhatsapp(brut: string): string | null {
  const s = String(brut ?? "").replace(/[\s().-]/g, "");
  const n = s.startsWith("00") ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

/** « How did you hear about us? » (inspiré du site Lovable). */
export const ENTENDU = ["ad", "referral", "sophia_app", "other", "none"] as const;
export type Entendu = (typeof ENTENDU)[number];

export interface SaisieCandidature {
  prenom: string;
  nom: string;
  email: string;
  whatsapp_e164: string;
  whatsapp_optin: boolean;
  pays: string;
  majeur: true;
  /** 25/11 (Max) : la question n'est plus posée par Join (null) ; une réponse d'un ancien formulaire est gardée. */
  deux_telephones: boolean | null;
  entendu: Entendu;
  parrain: string | null;
  reponses: Record<string, string>;
  langue: string;
}

export type Validation = { ok: true; valeurs: SaisieCandidature } | { ok: false; erreurs: string[] };

/**
 * Les 4 réponses que les règles de l'OS exigent (manquesCandidature) : le formulaire Join ne pose plus ces questions,
 * elles sont remplies à partir de ce que la personne a déclaré et accepté (pays, rythme accepté, compte TikTok
 * fourni, canal d'arrivée).
 */
export function reponsesOS(pays: string, entendu: Entendu, parrain: string | null): Record<string, string> {
  return {
    pays_actuel: pays,
    heures: "Agreed: 2 slideshows a day, 7 days a week",
    tiktok: "Agreed: creates a new TikTok account with the username, photo and bio we give (it belongs to Vik Studios)",
    contenu: `Heard about us: ${entendu}${parrain ? ` (referred by ${parrain})` : ""}`,
  };
}

/**
 * Valide le formulaire v2 : champs requis, email, WhatsApp E.164, pays ISO2, 18 ans ou plus (oui obligatoire),
 * canal d'arrivée (+ nom du parrain), tarif accepté, engagement, consentement. Le champ piège `site` doit rester vide.
 * 25/11 (Max) : plus de question « deux téléphones » (facultative : absente = null, sinon un booléen).
 */
export function validerCandidature(b: Record<string, unknown>): Validation {
  const t = (k: string, max = 200) => String(b[k] ?? "").trim().slice(0, max);
  const erreurs: string[] = [];
  const prenom = t("prenom", 60);
  const nom = t("nom", 60);
  const email = t("email", 200).toLowerCase();
  const whatsapp = normaliserWhatsapp(t("whatsapp", 30));
  const pays = t("pays", 2).toUpperCase();
  const entendu = t("entendu", 20) as Entendu;
  const parrain = t("parrain", 80) || null;
  if (t("site", 200)) erreurs.push("site");
  if (!prenom) erreurs.push("prenom");
  if (!nom) erreurs.push("nom");
  if (!EMAIL.test(email)) erreurs.push("email");
  if (!whatsapp) erreurs.push("whatsapp");
  if (!/^[A-Z]{2}$/.test(pays)) erreurs.push("pays");
  if (b.majeur !== true) erreurs.push("majeur");
  if (b.deux_telephones != null && typeof b.deux_telephones !== "boolean") erreurs.push("deux_telephones");
  if (!(ENTENDU as readonly string[]).includes(entendu)) erreurs.push("entendu");
  if (entendu === "referral" && !parrain) erreurs.push("parrain");
  if (b.accord_tarif !== true) erreurs.push("accord_tarif");
  if (b.engagement !== true) erreurs.push("engagement");
  if (b.consentement !== true) erreurs.push("consentement");
  if (erreurs.length) return { ok: false, erreurs };
  const parrainGarde = entendu === "referral" ? parrain : null;
  return {
    ok: true,
    valeurs: {
      prenom, nom, email, whatsapp_e164: whatsapp!, whatsapp_optin: b.whatsapp_optin === true, pays, majeur: true,
      deux_telephones: typeof b.deux_telephones === "boolean" ? b.deux_telephones : null, entendu, parrain: parrainGarde,
      reponses: reponsesOS(pays, entendu, parrainGarde),
      langue: t("langue", 5).toLowerCase() || "en",
    },
  };
}

/**
 * La provenance gardée avec la candidature : code de parrainage, UTM, fbclid, page d'arrivée et date de la visite
 * (le site les garde 30 jours). Tout le reste est ignoré ; valeurs tronquées.
 */
export function nettoyerSource(v: unknown): Record<string, string> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  const garder = (k: string, max: number, motif?: RegExp) => {
    const s = typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "";
    if (s && (!motif || motif.test(s))) out[k] = s;
  };
  garder("ref", 40, /^[A-Za-z0-9_-]+$/);
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) garder(k, 100);
  garder("fbclid", 300);
  garder("landing", 200, /^\//);
  garder("at", 30, /^\d{4}-\d{2}-\d{2}T/);
  return out;
}

/** La candidature Join vue comme une candidature de l'OS (mêmes clés de réponses). */
export interface CandidatureJoin {
  prenom: string;
  nom: string;
  email: string;
  pays: string;
  age: number | null;
  /** 0841 : « Are you at least 18? » (les candidatures de la v1 n'ont que l'âge). */
  majeur?: boolean | null;
  deux_telephones: boolean | null;
  reponses: Record<string, string | null | undefined>;
  whatsapp_verifie_at: string | null;
  /** Le numéro donné (E.164) : il suffit quand le code WhatsApp n'est pas demandé (codeWhatsappActif). */
  whatsapp_e164?: string | null;
}

/**
 * 25/11 (Max) : pas de code de vérification par WhatsApp. Le code WhatsApp n'est demandé que si un modèle
 * d'authentification est configuré (join_mode.modele_code) ; sinon le code reçu par email suffit.
 */
export function codeWhatsappActif(mode: Pick<ModeJoin, "modele_code">): boolean {
  return !!mode.modele_code;
}

/** Les codes demandés sont vérifiés : l'email toujours, le WhatsApp seulement s'il est demandé. */
export function codesVerifies(
  c: { email_verifie_at: string | null; whatsapp_verifie_at: string | null },
  mode: Pick<ModeJoin, "modele_code">,
): boolean {
  return !!c.email_verifie_at && (!codeWhatsappActif(mode) || !!c.whatsapp_verifie_at);
}

/**
 * La candidature Join vue par les règles de l'OS. 25/11 (Max) : Join n'exige plus de deuxième téléphone, la condition
 * « 2 téléphones » de manquesCandidature (ruul.ts, partagée avec l'OS et le Hub, inchangée) est donc remplie ici.
 */
export function versCandidatureRuul(c: CandidatureJoin, whatsappExige = true): CandidatureRuul {
  return {
    adulte: c.majeur === true ? true : c.age == null ? (c.majeur === false ? false : null) : c.age >= 18,
    pays: c.pays || null,
    deux_telephones: true,
    a_telephone: !!c.whatsapp_verifie_at || (!whatsappExige && !!c.whatsapp_e164),
    nom: `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || null,
    email: c.email || null,
    reponses: c.reponses ?? {},
    desinscrit_at: null,
  };
}

export const MESSAGE_A_TRAITER = "We'll get back to you within 48h";

/** Les règles de l'OS : rien ne manque → acceptée automatiquement, sinon à traiter (réponse sous 48 h). */
export function decider(
  c: CandidatureJoin, paysOuverts: Set<string>, whatsappExige = true,
): { decision: "auto" | "a_traiter"; manques: string[] } {
  const manques = manquesCandidature(versCandidatureRuul(c, whatsappExige), paysOuverts);
  return { decision: manques.length ? "a_traiter" : "auto", manques };
}

/**
 * 25/11 (Max) : la décision de Join = les règles de l'OS (decider : 18 ans ou plus, pays ouvert, 2 téléphones,
 * réponses) + la langue du pays gérée par l'OS (`langue_os` de hub-posteurs « zones » : langue connue et publiée par
 * des comptes actifs ; null = l'OS n'a pas répondu) + aucun doublon (join_doublons : email, téléphone, nom). Tout ce
 * qui manque est écrit en clair dans `manques` (liste de l'admin, page Aujourd'hui de l'OS).
 */
export function deciderJoin(
  c: CandidatureJoin, paysOuverts: Set<string>, whatsappExige: boolean,
  extra: { langue: { geree: boolean | null; code: string | null }; doublons: string[] },
): { decision: "auto" | "a_traiter"; manques: string[] } {
  const manques = [...decider(c, paysOuverts, whatsappExige).manques];
  const paysKo = manques.some((m) => m.startsWith("pays fermé") || m === "pays inconnu");
  if (!paysKo && extra.langue.geree === false) manques.push(`langue non gérée par l'OS (${extra.langue.code ?? "?"})`);
  if (!paysKo && extra.langue.geree === null) manques.push("langue non vérifiée (OS injoignable)");
  for (const d of extra.doublons) if (d && !manques.includes(d)) manques.push(d);
  return { decision: manques.length ? "a_traiter" : "auto", manques };
}

// ---------------------------------------------------------------------------------------------------------------
// Acceptation automatique (réglage join_auto_acceptation, 0847) et étapes vues par l'admin
// ---------------------------------------------------------------------------------------------------------------

/** Le réglage `join_auto_acceptation` : seul `{ "actif": true }` l'allume. OFF par défaut. */
export function lireAutoAcceptation(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as Record<string, unknown>).actif === true;
}

/**
 * La décision appliquée : les règles de l'OS (decider), puis l'interrupteur. OFF : une candidature qui remplit
 * les conditions attend l'admin (« a_traiter », sans manque : `eligible`), comme celles à qui il manque quelque chose.
 */
export function deciderAvecReglage(
  d: { decision: "auto" | "a_traiter"; manques: string[] },
  autoAcceptation: boolean,
): { decision: "auto" | "a_traiter"; manques: string[]; eligible: boolean } {
  const eligible = d.decision === "auto";
  return { decision: eligible && autoAcceptation ? "auto" : "a_traiter", manques: d.manques, eligible };
}

export const ETAPES_ADMIN = ["ferme", "codes", "verifiee", "a_traiter", "acceptee", "signee", "refusee", "expiree"] as const;
export type EtapeAdmin = (typeof ETAPES_ADMIN)[number];

/** L'étape d'une candidature dans la liste de l'admin. */
export function etapeAdmin(
  c: {
    decision: string | null;
    manques?: string[] | null;
    email_verifie_at: string | null;
    whatsapp_verifie_at: string | null;
    expire_at?: string | null;
  },
  signee: boolean,
  whatsappExige = true,
): EtapeAdmin {
  if (signee) return "signee";
  if (c.expire_at) return "expiree";
  if (c.decision === "refusee") return "refusee";
  if (c.decision === "auto") return "acceptee";
  if (c.decision === "a_traiter") return "a_traiter";
  if (c.manques?.some((m) => m.startsWith("pays fermé"))) return "ferme";
  if (c.email_verifie_at && (c.whatsapp_verifie_at || !whatsappExige)) return "verifiee";
  return "codes";
}

/** Ce que l'admin peut décider : accepter (codes vérifiés, pas signée, pas expirée), refuser (pas signée). */
export function decisionsAdminPossibles(etape: EtapeAdmin): { accepter: boolean; refuser: boolean } {
  return {
    accepter: etape === "verifiee" || etape === "a_traiter" || etape === "refusee",
    refuser: etape !== "signee" && etape !== "refusee" && etape !== "expiree",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pays et paie
// ---------------------------------------------------------------------------------------------------------------

export interface PaysPaie {
  pays: string;
  zone: string;
  tarif: number | null;
}

/** Les pays ouverts (zone active, recrutement non fermé) et le tarif de leur zone. */
export function paysEtPaie(
  zones: { zone: string; tarif: number | string | null }[],
  paysZones: { pays: string; zone: string; retire_at?: string | null }[],
  fermes: string[],
): { zones: { zone: string; tarif: number | null }[]; pays: PaysPaie[] } {
  const tarif = new Map(zones.map((z) => [z.zone, z.tarif == null ? null : Number(z.tarif)]));
  const ferme = new Set(fermes.map((p) => p.toUpperCase()));
  const pays = paysZones
    .filter((p) => !p.retire_at && !ferme.has(p.pays.toUpperCase()))
    .map((p) => ({ pays: p.pays.toUpperCase(), zone: p.zone, tarif: tarif.get(p.zone) ?? null }))
    .sort((a, b) => a.pays.localeCompare(b.pays));
  return { zones: [...tarif].map(([zone, t]) => ({ zone, tarif: t })).sort((a, b) => a.zone.localeCompare(b.zone)), pays };
}

// ---------------------------------------------------------------------------------------------------------------
// Codes, jetons, empreintes
// ---------------------------------------------------------------------------------------------------------------

/** Un code à 6 chiffres (aléatoire cryptographique, sans biais notable). */
export function genererCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

/** Un jeton de session (32 octets, base64url). Seule son empreinte est gardée en base. */
export function genererJeton(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(texte: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type EtatCode = "ok" | "faux" | "expire" | "trop_essais" | "deja";

/** Vérifie un code : déjà vérifié, 5 essais au plus, 15 minutes. `hashFourni` = sha256 du code saisi. */
export function etatCode(
  v: { code_hash: string; essais: number; expire_at: string; verifie_at: string | null },
  hashFourni: string,
  maintenant = new Date(),
): EtatCode {
  if (v.verifie_at) return "deja";
  if (v.essais >= CODE_ESSAIS_MAX) return "trop_essais";
  if (new Date(v.expire_at).getTime() < maintenant.getTime()) return "expire";
  return v.code_hash === hashFourni ? "ok" : "faux";
}

// ---------------------------------------------------------------------------------------------------------------
// Handle TikTok et date du premier post
// ---------------------------------------------------------------------------------------------------------------

const MOTS = ["daily", "reads", "notes", "facts", "learns", "mind", "slides", "smart", "vibes", "study"];

/** Un handle proposé : prénom (sans accents, minuscules) + un mot + 3 chiffres. `alea` dans [0, 1). */
export function handlePropose(prenom: string, alea: () => number = Math.random): string {
  const base = prenom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) ||
    "creator";
  const mot = MOTS[Math.floor(alea() * MOTS.length) % MOTS.length];
  const n = String(Math.floor(alea() * 1000) % 1000).padStart(3, "0");
  return `${base}.${mot}${n}`;
}

/** Un handle saisi : « @ » retiré, minuscules ; 2 à 24 caractères (lettres, chiffres, point, tiret bas). */
export function nettoyerHandle(h: string): string | null {
  const s = String(h ?? "").trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{2,24}$/.test(s) ? s : null;
}

function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Le lundi du premier post. Cohorte = lundi qui suit l'acceptation (lundiSuivant). Si le warm-up n'est pas
 * terminé avant le dimanche 23:59 qui précède, le premier post glisse d'une semaine (autant de fois que
 * nécessaire). `aujourdhui` est le jour de Paris (AAAA-MM-JJ).
 */
export function premierPost(cohorte: string, warmupFini: boolean, aujourdhui: string): string {
  let c = cohorte;
  if (!warmupFini) while (aujourdhui >= c) c = ajouterJours(c, 7);
  return c;
}

export function cohorteDe(jourAcceptation: string): string {
  return lundiSuivant(jourAcceptation);
}

/** Le jour (AAAA-MM-JJ) à Paris pour un instant donné. */
export function jourParis(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

/** L'instant de minuit (00:00, heure de Paris) au début du jour donné. */
export function minuitParis(jour: string): Date {
  const utc = new Date(`${jour}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(utc));
  return new Date(utc.getTime() - h * 3_600_000);
}

/**
 * La date limite de signature : le dimanche à minuit (heure de Paris) avant le lundi de départ, c.-à-d. le lundi
 * de la cohorte à 00:00 Paris.
 */
export function dateLimiteSignature(cohorte: string): Date {
  return minuitParis(cohorte);
}

/** Le lundi de départ au moment de la signature : la cohorte, ou le lundi suivant si la date limite est passée. */
export function cohorteASignature(cohorte: string | null, maintenant = new Date()): string {
  if (cohorte && maintenant.getTime() < dateLimiteSignature(cohorte).getTime()) return cohorte;
  return lundiSuivant(jourParis(maintenant));
}

// ---------------------------------------------------------------------------------------------------------------
// Automatisation (cron horaire) : relances, expiration, enchaînement après signature
// ---------------------------------------------------------------------------------------------------------------

const JOUR_MS = 86_400_000;

/** Relance du contrat : J+1 puis J+3 après l'acceptation (une fois chacune) ; sans signature à J+7 : expirée. */
export function etapeRelanceSignature(
  decisionAt: string,
  faites: string[],
  maintenant = new Date(),
): "signature_j1" | "signature_j3" | "expirer" | null {
  const jours = (maintenant.getTime() - new Date(decisionAt).getTime()) / JOUR_MS;
  if (jours >= 7) return "expirer";
  if (jours >= 3 && !faites.includes("signature_j3")) return "signature_j3";
  if (jours >= 1 && jours < 3 && !faites.includes("signature_j1")) return "signature_j1";
  return null;
}

/** Relance des codes : une seule fois, entre 1 h et 7 jours après la candidature, si un code n'est pas vérifié. */
export function relanceCodeDue(creeAt: string, toutVerifie: boolean, dejaFaite: boolean, maintenant = new Date()): boolean {
  if (toutVerifie || dejaFaite) return false;
  const h = (maintenant.getTime() - new Date(creeAt).getTime()) / 3_600_000;
  return h >= 1 && h < 24 * 7;
}

/**
 * Après la signature, dans l'ordre : compte OS, Slack (le lien seulement), la bienvenue (accès), puis l'invitation
 * Ruul. 25/11 : la bienvenue passe avant l'invitation Ruul (l'email Ruul arrive après celui des accès).
 */
export const ETAPES_APRES_SIGNATURE = ["compte_os", "slack", "acces", "ruul"] as const;
export type EtapeApresSignature = (typeof ETAPES_APRES_SIGNATURE)[number];

export function etapesRestantes(faites: string[]): EtapeApresSignature[] {
  return ETAPES_APRES_SIGNATURE.filter((e) => !faites.includes(e));
}

// ---------------------------------------------------------------------------------------------------------------
// 25/11 (Max) : réglage `join_reel` (0858) — un drapeau par étape d'après la signature, tous à false par défaut
// ---------------------------------------------------------------------------------------------------------------

/**
 * compte_os : le posteur créé dans l'OS · acces : la bienvenue · ruul : l'invitation Ruul · rappels : les rappels de
 * la checklist (Join devient la seule voix de ces étapes) · whatsapp : les WhatsApp d'après la signature. Slack n'a
 * pas de drapeau : rien n'est envoyé (le lien d'invitation est affiché).
 */
export const DRAPEAUX_REEL = ["compte_os", "acces", "ruul", "rappels", "whatsapp"] as const;
export type DrapeauReel = (typeof DRAPEAUX_REEL)[number];
export type JoinReel = Record<DrapeauReel, boolean>;

/** Le réglage : seul `true` (booléen) rend une étape réelle ; absent ou illisible : tout simulé. */
export function lireJoinReel(v: unknown): JoinReel {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(DRAPEAUX_REEL.map((d) => [d, o[d] === true])) as JoinReel;
}

/**
 * Pourquoi une étape est simulée (null : elle est réelle). `test` : candidature créée en mode test — l'OS n'a pas de
 * « posteur TEST » pour un posteur payé par Ruul (contrats_test = contrats Upwork), donc la création OS reste simulée ;
 * `profil` : une fiche OS existe (l'invitation Ruul en a besoin).
 */
export function raisonSimulation(
  drapeau: DrapeauReel, reel: JoinReel, o: { test: boolean; simuler?: boolean; profil?: boolean },
): string | null {
  if (o.simuler) return "simulation (horloge simulée)";
  if (!reel[drapeau]) return `drapeau join_reel.${drapeau} à false`;
  if (drapeau === "compte_os" && o.test) {
    return "candidature de test : pas de posteur TEST possible pour un posteur Ruul (contrats_test ne couvre que les contrats Upwork)";
  }
  if (drapeau === "ruul" && !o.profil) return "pas de fiche OS (compte OS simulé)";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// La checklist de la page personnelle (join_etapes) et ses rappels
// ---------------------------------------------------------------------------------------------------------------

export const ETAPES_CHECKLIST = ["contrat", "ruul", "tiktok", "warmup", "slack", "premier_post"] as const;
export type EtapeChecklist = (typeof ETAPES_CHECKLIST)[number];
export type EtatChecklist = Record<EtapeChecklist, boolean>;
export type EtapeRappel = Exclude<EtapeChecklist, "contrat">;

/** Une ligne de join_etat_os (0858) : ce que l'OS sait du posteur. */
export interface EtatOS {
  profile_id: string;
  is_active: boolean | null;
  relances_stop_at: string | null;
  cohorte_lundi: string | null;
  premiere_connexion_at: string | null;
  ruul_email: string | null;
  ruul_onboarding: string | null;
  ruul_ready_at: string | null;
  ruul_retire_at: string | null;
  ruul_jeton: string | null;
  handle: string | null;
  tiktok: boolean | null;
  warmup_started_at: string | null;
  slack: boolean | null;
  premier_post_at: string | null;
  posts_prevus: boolean | null;
  arrete: boolean | null;
  desinscrit: boolean | null;
  paie_reportee: boolean | null;
  email_jour: boolean | null;
}

/**
 * La checklist : une étape est faite quand l'OS la voit faite (Ruul READY, compte TikTok vu / déclaré / warm-up lancé,
 * warm-up lancé, Slack relié, premier post publié), ou quand Join l'a déjà notée faite (« ok » de la vérification du
 * @ TikTok, « fait »). Une étape cochée le reste.
 */
export function etatChecklist(j: { signee: boolean; etapes: { etape: string; statut: string }[] }, os: EtatOS | null): EtatChecklist {
  const notee = (e: string) => j.etapes.some((x) => x.etape === e && (x.statut === "fait" || x.statut === "ok"));
  return {
    contrat: j.signee,
    ruul: notee("ruul") || (!!os && (os.ruul_onboarding === "READY" || !!os.ruul_ready_at)),
    tiktok: notee("tiktok") || os?.tiktok === true || !!os?.warmup_started_at,
    warmup: notee("warmup") || !!os?.warmup_started_at,
    slack: notee("slack") || os?.slack === true,
    premier_post: notee("premier_post") || !!os?.premier_post_at,
  };
}

/** L'événement du QG noté quand une étape se coche (une fois). */
export const EVENEMENT_ETAPE: Partial<Record<EtapeChecklist, string>> = {
  ruul: "ruul_ready", tiktok: "tiktok_ok", warmup: "warmup", slack: "slack", premier_post: "premier_post",
};

/** Un rappel dû : `cle` = la ligne de join_relances (`rappel:<étape>:<rang>`), jamais deux fois. */
export interface RappelDu {
  etape: EtapeRappel;
  rang: string;
  cle: string;
}

/** Les rappels Ruul du jeudi après le lundi de départ (Ruul pas READY), au plus. */
export const RUUL_JEUDIS_MAX = 4;

/** L'ordre des étapes dans un rappel (l'objet de l'email est celui de la première). */
export const PRIORITE_RAPPELS: readonly EtapeRappel[] = ["premier_post", "tiktok", "warmup", "ruul", "slack"];

/**
 * Les rappels dus maintenant pour les étapes pas faites (25/11, Max). Jours du calendrier dans le fuseau du pays.
 *  - Ruul, TikTok, warm-up, Slack : J+1 puis J+3 après la signature (J+1 manquée : J+3 seulement ; rien après J+6),
 *    puis le vendredi (ou samedi, dimanche) avant le lundi de départ — une fois par lundi (un départ reporté par
 *    l'OS en redonne un).
 *  - Ruul, après le départ : le jeudi (4 au plus), sauf paie reportée (l'OS en parle déjà, rappel_reportes) ; et
 *    3 jours après le premier post (le WhatsApp ruul_payment_setup de l'OS).
 *  - Premier post (warm-up lancé, posts prévus) : le lundi de départ, J+1, J+3 (3 semaines au plus).
 */
export function rappelsDus(o: {
  signeAt: string;
  lundi: string;
  faites: EtatChecklist;
  deja: readonly string[];
  pays: string | null;
  premierPostAt?: string | null;
  postsPrevus?: boolean;
  paieReportee?: boolean;
  maintenant: Date;
}): RappelDu[] {
  const auj = dateLocale(o.pays, o.maintenant);
  const j = joursEntre(dateLocale(o.pays, new Date(o.signeAt)), auj);
  const avantLundi = joursEntre(auj, o.lundi);
  const dus: RappelDu[] = [];
  const ajouter = (etape: EtapeRappel, rang: string) => {
    const cle = `rappel:${etape}:${rang}`;
    if (!o.deja.includes(cle) && !dus.some((d) => d.cle === cle)) dus.push({ etape, rang, cle });
  };
  for (const e of ["tiktok", "warmup", "ruul", "slack"] as const) {
    if (o.faites[e]) continue;
    if (j >= 1 && j < 3) ajouter(e, "j1");
    else if (j >= 3 && j < 7) ajouter(e, "j3");
    if (j >= 1 && avantLundi >= 1 && avantLundi <= 3) ajouter(e, `vendredi:${o.lundi}`);
  }
  if (!o.faites.ruul && avantLundi <= 0) {
    const jeudis = o.deja.filter((x) => x.startsWith("rappel:ruul:jeudi:")).length;
    if (!o.paieReportee && jourSemaineLocal(o.pays, o.maintenant) === 4 && jeudis < RUUL_JEUDIS_MAX) ajouter("ruul", `jeudi:${auj}`);
    if (o.premierPostAt) {
      const depuis = (o.maintenant.getTime() - Date.parse(o.premierPostAt)) / 86_400_000;
      if (depuis >= 3 && depuis < 10) ajouter("ruul", "apres_post");
    }
  }
  if (!o.faites.premier_post && o.faites.warmup && o.postsPrevus !== false && avantLundi <= 0 && -avantLundi <= 21) {
    const d = -avantLundi;
    if (d === 0) ajouter("premier_post", `lundi:${o.lundi}`);
    else if (d < 3) ajouter("premier_post", `j1:${o.lundi}`);
    else if (d < 7) ajouter("premier_post", `j3:${o.lundi}`);
  }
  return PRIORITE_RAPPELS.flatMap((e) => dus.filter((d) => d.etape === e));
}

/**
 * Le modèle WhatsApp d'un rappel (les relances de l'OS : mêmes motifs « relance:<type> », mêmes clés), ou null
 * (Slack, premier post à J+1 : email seulement).
 */
export function typeWhatsappRappel(d: RappelDu): TypeRelance | null {
  if (d.etape === "premier_post") return d.rang.startsWith("lundi:") ? "start_posting_today" : d.rang.startsWith("j3:") ? "no_posts_week" : null;
  if (d.etape === "tiktok" || d.etape === "warmup") return "warmup_start";
  if (d.etape === "ruul") return "ruul_payment_setup";
  return null;
}

/**
 * L'email d'un jour de rappels (un seul par jour : toutes les étapes dues dedans, l'objet est celui de la première).
 * Anglais (traduit à l'envoi dans la langue du candidat), jamais « bot », « IA », « automatique ».
 */
export function texteRappel(
  dus: readonly RappelDu[],
  v: { prenom: string; lundi: string; limite: string; avantDepart: boolean; handle?: string | null; ruulEmail?: string | null },
): { objet: string; corps: string; bouton: string } {
  const etapes = PRIORITE_RAPPELS.filter((e) => dus.some((d) => d.etape === e));
  const debut = dus.some((d) => d.etape === "premier_post" && d.rang.startsWith("lundi:"));
  const OBJETS: Record<EtapeRappel, string> = {
    premier_post: debut ? "You start posting today" : "Your first post is waiting",
    tiktok: "Next step: create your TikTok account",
    warmup: "Next step: start your TikTok warm-up",
    ruul: "Reminder: set up Ruul to get paid",
    slack: "Join our Slack",
  };
  const LIGNES: Record<EtapeRappel, string> = {
    premier_post: debut
      ? `You start posting today: your 2 slideshows are ready on your dashboard (${LIEN_DASHBOARD_OS}). Post them on TikTok, then paste the link of each post on your dashboard.`
      : `We haven't seen your first post yet. Your 2 slideshows a day are ready on your dashboard (${LIEN_DASHBOARD_OS}): post them on TikTok, then paste the link of each post on your dashboard. You're paid for every post you publish.`,
    tiktok: `Create your new TikTok account${v.handle ? ` with this exact username: @${v.handle}` : ""}, with the photo and bio shown on your checklist.`,
    warmup: `Log in to your dashboard (${LIEN_DASHBOARD_OS}), click « Start warmup », follow at least 5 accounts and use TikTok normally a few minutes a day.`,
    ruul: `Set up Ruul to get paid (about 10 minutes): create your account${v.ruulEmail ? ` with ${v.ruulEmail}` : ""}, then add your ID and bank details. Your personal Ruul link is on your checklist.`,
    slack: `Join our Slack with your personal email and your full name: ${LIEN_SLACK}`,
  };
  const intro = v.avantDepart
    ? `Here's what's left before ${v.limite}, so you can start on ${v.lundi}:`
    : etapes.length > 1 ? "Here's what's left:" : null;
  const liste = etapes.length > 1 || intro ? etapes.map((e, i) => `${i + 1}. ${LIGNES[e]}`).join("\n") : LIGNES[etapes[0]];
  return {
    objet: OBJETS[etapes[0]] ?? "Your next steps",
    corps: [
      `Hi ${v.prenom},`,
      ...(intro ? [intro] : []),
      liste,
      "Each step on your checklist ticks itself as soon as we see it done.",
      "Any question? Log in to your dashboard and click Help.",
    ].join("\n\n"),
    bouton: "Open my checklist",
  };
}

export type TypeMessageJoin =
  | "code_rappel" | "signature_j1" | "signature_j3" | "signature_vendredi" | "expiree" | "acces" | "acceptee" | "refusee";
export const TYPES_MESSAGE_JOIN: readonly TypeMessageJoin[] = [
  "code_rappel", "signature_j1", "signature_j3", "signature_vendredi", "expiree", "acces", "acceptee", "refusee",
];

/**
 * 25/11 : le rappel du contrat du vendredi (ou samedi, dimanche) avant le lundi offert, après J+1, une fois ; pas le
 * jour d'une autre relance du contrat. Derrière le drapeau join_reel.rappels (sinon simulé).
 */
export function signatureVendrediDue(o: {
  decisionAt: string; lundi: string; faites: readonly string[]; pays: string | null; maintenant: Date; dejaAujourdhui: boolean;
}): boolean {
  const auj = dateLocale(o.pays, o.maintenant);
  const avant = joursEntre(auj, o.lundi);
  return !o.dejaAujourdhui && !o.faites.includes("signature_vendredi") && avant >= 1 && avant <= 3 &&
    joursEntre(dateLocale(o.pays, new Date(o.decisionAt)), auj) >= 1;
}

/**
 * Les messages aux candidats (anglais). `lien` = l'adresse de Join, sauf pour « acces » (la bienvenue après la
 * signature) : `lien` y est le lien personnel « Set my password » de l'OS (jamais un mot de passe) ; sans compte
 * créé (mode test), `lien` reste l'adresse de Join et le texte le dit.
 */
export function texteMessage(
  type: TypeMessageJoin,
  v: {
    prenom: string;
    lien: string;
    lundi?: string;
    limite?: string;
    /** acces : le login de l'OS, le handle TikTok, l'email Ruul ; `compteCree` = un vrai lien « Set my password ». */
    login?: string | null;
    handle?: string | null;
    ruulEmail?: string | null;
    compteCree?: boolean;
    /** acces (25/11) : l'invitation Ruul part dans un email à part (join_reel.ruul) : une ligne courte à la place du guide. */
    ruulParEmail?: boolean;
  },
): { objet: string; corps: string; bouton: string | null } {
  const salut = `Hi ${v.prenom},`;
  switch (type) {
    case "code_rappel":
      return {
        objet: "Finish your application",
        corps: `${salut}\n\nYour application is almost done: you just need to confirm your email with the code we sent you. Log in with your email and we'll send you a new code.`,
        bouton: "Finish my application",
      };
    case "signature_j1":
    case "signature_j3":
    case "signature_vendredi":
      return {
        objet: "Your contract is waiting for your signature",
        corps: `${salut}\n\nYour contract is waiting for your signature. Sign it before ${v.limite ?? "Sunday"}, midnight (Paris time), to start on ${v.lundi ?? "Monday"}. It takes 2 minutes.`,
        bouton: "Sign my contract",
      };
    case "expiree":
      return {
        objet: "Your application",
        corps: `${salut}\n\nYour contract wasn't signed in time, so this offer has expired. You're welcome to apply again whenever you're ready. Thank you for your interest.`,
        bouton: "Apply again",
      };
    case "acceptee":
      return {
        objet: "You're in — your contract is ready",
        corps: `${salut}\n\nGood news: your application is accepted. Last step: read and sign your contract. Sign it before ${v.limite ?? "Sunday"}, midnight (Paris time), to start on ${v.lundi ?? "Monday"}. It takes 2 minutes.`,
        bouton: "Sign my contract",
      };
    case "refusee":
      return {
        objet: "Your application",
        corps: `${salut}\n\nThank you for applying to Vik Studios. We can't offer you a place for now. Thank you for your interest.`,
        bouton: null,
      };
    case "acces": {
      // 23/11 : la bienvenue après la signature, inspirée de emailParcours("bienvenue") : accès au dashboard par le
      // lien « Set my password » (jamais de mot de passe), les étapes, Slack et Ruul.
      const lienMdp = v.compteCree
        ? `- Set my password: ${v.lien} (personal link, valid 14 days: you choose your own password)`
        : "- Set my password: your personal link arrives as soon as your account is created";
      return {
        objet: "Welcome to Vik Studios — your access and next steps",
        corps: [
          salut,
          "Welcome to Vik Studios! Your job: post 2 slideshows a day on TikTok. Everything you post is ready for you on your dashboard.",
          `You start on ${v.lundi ?? "Monday"}.`,
          `Watch our short video guide: ${VIDEO_GUIDE_URL}`,
          [
            "Your access:",
            `- Dashboard: ${LIEN_DASHBOARD_OS}`,
            `- Login: ${v.login ?? "(see the « Set my password » page)"}`,
            lienMdp,
            ...(v.handle ? [`- Your TikTok account, with this exact name: @${v.handle}`] : []),
            `- Our Slack (sign up with your personal email and your full name): ${LIEN_SLACK}`,
          ].join("\n"),
          `Before ${v.limite ?? "Sunday midnight (Paris time)"}:\n1. Set your password and log in to your dashboard.\n2. Create your TikTok account with the exact name above.\n3. Click « Start warmup » on your dashboard, follow at least 5 accounts and use TikTok normally.\n4. Join Slack.`,
          PHRASE_QUESTION_OS,
          v.ruulParEmail
            ? `Set up Ruul — required to get paid: your personal Ruul link arrives in a separate email${v.ruulEmail ? ` (create your account with ${v.ruulEmail})` : ""}, and it's on your checklist: ${JOIN_URL_PUBLIC}`
            : guideRuul(v.ruulEmail ?? null, v.limite ?? null),
        ].join("\n\n"),
        bouton: v.compteCree ? "Set my password" : "Open my dashboard",
      };
    }
  }
}

/**
 * La langue des emails d'un candidat, en code de l'OS (traduction_email.ts) : le « pt » de Join est le portugais du
 * Brésil (comme la majorité des comptes de l'OS), « nb » est le norvégien de l'OS (« no ») ; le reste tel quel.
 */
export function langueEmailJoin(langue: string | null | undefined): string {
  const l = String(langue ?? "").trim().toLowerCase();
  if (l === "pt" || l === "pt-br") return "pt-BR";
  if (l === "nb" || l === "nn") return "no";
  if (l === "es-419") return "es-419";
  return l.split(/[-_]/)[0] || "en";
}

/** « Monday 30 November » (anglais). */
export function lundiLisible(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------------------------------------------
// Contrat. join-v3 : join-v2 + l'identité complète de la société en tête (23/11). join-v4 (23/11, Max) : join-v3 +
// deux phrases, rien d'autre (vérifié par join_test.ts) : frais Ruul payés par la société, pas d'exclusivité.
// join-v5 (25/11, Max) : join-v4 + la 1re ligne du résumé alignée sur le site (le posteur CRÉE le compte TikTok avec
// le pseudo, la photo et la bio qu'on lui donne), rien d'autre (vérifié par join_test.ts).
// ---------------------------------------------------------------------------------------------------------------

export const CONTRAT_VERSION = "join-v5";

/** join-v5 : la 1re ligne du résumé, avant (join-v4) et après. */
export const CONTRAT_RESUME_V5 = {
  avant: "You post 2 ready-made slideshows a day on a TikTok account we give you.",
  apres: "You post 2 ready-made slideshows a day on a new TikTok account that you create with the username, photo and bio we give you.",
} as const;

/** Les deux phrases ajoutées en join-v4 (clause 4 « Payment », clause 2 « Independent status »). */
export const CONTRAT_AJOUTS_V4 = { frais_ruul: "Ruul fees are paid by the Company.", exclusivite: "This agreement is not exclusive." } as const;

/** L'en-tête du contrat : l'identité complète de la société (aucune coordonnée bancaire). */
export const CONTRAT_SOCIETE = `${SOCIETE.nom} (trade name: ${SOCIETE.nom_commercial}), a French ${SOCIETE.forme} with a share capital of ${SOCIETE.capital}
Registered office: ${SOCIETE.siege}
SIREN ${SOCIETE.siren} · SIRET ${SOCIETE.siret} · ${SOCIETE.rcs} · VAT ${SOCIETE.tva}
President: ${SOCIETE.president} · Contact: ${SOCIETE.contact}`;

export const CONTRAT_RESUME = [
  CONTRAT_RESUME_V5.apres,
  "You are an independent freelancer, not an employee.",
  "You pay your own taxes and social contributions.",
  "You are paid every Monday through Ruul for the week before. Our obligation ends when we pay Ruul; any problem with Ruul goes to Ruul support.",
  "The TikTok accounts and all content belong to Vik Studios.",
  "Either side can end this at any time, without notice. Only the posts already made are paid.",
];

export const CONTRAT_TEXTE = `FREELANCE SERVICES AGREEMENT (version ${CONTRAT_VERSION})

Between:
${CONTRAT_SOCIETE}
the publisher of the Sophia app ("the Company"),
and the person signing below under their legal name ("the Creator").

1. Purpose
The Creator publishes, on TikTok accounts provided or approved by the Company, content prepared by the Company (two slideshows a day unless the dashboard says otherwise), following the instructions shown in the Creator dashboard.

2. Independent status
The Creator acts as an independent freelancer. Nothing in this agreement creates an employment relationship, a partnership or an agency. The Creator organises their own work and uses their own devices. ${CONTRAT_AJOUTS_V4.exclusivite}

3. Taxes and social contributions
The Creator is solely responsible for declaring their income and paying any taxes, social contributions or other charges due in their country of residence.

4. Payment
The Creator is paid per week of published posts, at the rate of their country's pay zone shown on the Join page at the time of signing. The Creator is paid every Monday for the posts of the week before (Monday to Sunday). Payments are made through Ruul, a third-party payment platform, to the Ruul account of the email given at signature. ${CONTRAT_AJOUTS_V4.frais_ruul} The Company's payment obligation is fully discharged once the amount is paid to Ruul. Any problem with receiving funds from Ruul (account, identity checks, fees, delays, withdrawals) must be raised with Ruul support directly.

5. Ownership of accounts and content
All TikTok accounts created or used for this work, their usernames, followers, and all content published on them belong exclusively to the Company. The Creator hands over all access on request and at the end of the agreement, and does not change passwords, usernames or content without the Company's instructions.

6. Eligibility
The Creator confirms they are 18 years old or older, that they reside in the country declared in their application, and that the information given in the application is true.

7. Rules of work
The Creator never uses a VPN, proxy or any tool to hide or change their location on the devices used for this work. The Creator follows the posting instructions, posts only the content provided, and does not buy followers, views or engagement.

8. Confidentiality
The Creator keeps confidential all information about the Company, its apps, methods, content, accounts, pay rates and other creators, during the agreement and after it ends.

9. Termination
Either party may end this agreement at any time, without notice and without compensation. Only the posts already published in accordance with the instructions are paid.

10. Liability
The Company's total liability under this agreement is limited to the amounts paid to the Creator over the last four (4) paid weeks.

11. Personal data
The Company processes the Creator's personal data (name, contact details, country, payment details, activity) only to manage this agreement, pay the Creator and meet its legal obligations. The Creator may request access, correction or deletion of their data by contacting the Company, subject to legal retention obligations.

12. Electronic signature
The Creator signs electronically by typing their legal name. The legal name, date, time, IP address and device information are recorded with a copy of this text as proof of signature.

13. Governing law
This agreement is governed by French law. Any dispute falls under the jurisdiction of the competent courts of France.`;

/** Le texte signé tel quel (copie intégrale gardée avec la signature, et son empreinte). */
export function texteContratComplet(): string {
  return `${CONTRAT_RESUME.map((l) => `- ${l}`).join("\n")}\n\n${CONTRAT_TEXTE}`;
}
