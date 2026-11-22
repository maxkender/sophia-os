/**
 * join — les règles pures de l'app « Join » (parcours posteur, 22/11, Max). Sans réseau ni base (testé dans
 * join_test.ts). La fonction Edge `join` ne fait que les appliquer. MODE TEST : rien ne part à de vrais posteurs.
 *
 * Les règles d'acceptation sont celles de l'OS : `manquesCandidature` et `lundiSuivant` de ruul.ts (importées,
 * jamais copiées).
 */
import { type CandidatureRuul, lundiSuivant, manquesCandidature } from "./ruul.ts";

export const ETAPES_JOIN = ["tiktok", "profil", "warmup", "slack", "ruul"] as const;
export type EtapeJoin = (typeof ETAPES_JOIN)[number];
export const estEtapeJoin = (e: unknown): e is EtapeJoin => (ETAPES_JOIN as readonly unknown[]).includes(e);

export const CLES_REPONSES = ["pays_actuel", "heures", "tiktok", "contenu"] as const;

export const CONSENTEMENT =
  "I agree to be contacted about my application and my work by WhatsApp, SMS and email";

export const CODE_ESSAIS_MAX = 5;
export const CODE_DUREE_MIN = 15;

// ---------------------------------------------------------------------------------------------------------------
// Mode (réglage join_mode)
// ---------------------------------------------------------------------------------------------------------------

export interface ModeJoin {
  mode: "test" | "live";
  testeurs_emails: string[];
  testeurs_whatsapp: string[];
}

/** Lit le réglage ; tout ce qui n'est pas explicitement « live » est du test. */
export function lireModeJoin(v: unknown): ModeJoin {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const liste = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    mode: o.mode === "live" ? "live" : "test",
    testeurs_emails: liste(o.testeurs_emails).map((e) => e.trim().toLowerCase()),
    testeurs_whatsapp: liste(o.testeurs_whatsapp).map((n) => n.replace(/[^\d+]/g, "")),
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

export interface SaisieCandidature {
  prenom: string;
  nom: string;
  email: string;
  whatsapp_e164: string;
  pays: string;
  age: number;
  deux_telephones: boolean;
  reponses: Record<string, string>;
  langue: string;
}

export type Validation = { ok: true; valeurs: SaisieCandidature } | { ok: false; erreurs: string[] };

/** Valide le formulaire : champs requis, email, WhatsApp E.164, pays ISO2, âge, consentement obligatoire. */
export function validerCandidature(b: Record<string, unknown>): Validation {
  const t = (k: string, max = 200) => String(b[k] ?? "").trim().slice(0, max);
  const erreurs: string[] = [];
  const prenom = t("prenom", 60);
  const nom = t("nom", 60);
  const email = t("email", 200).toLowerCase();
  const whatsapp = normaliserWhatsapp(t("whatsapp", 30));
  const pays = t("pays", 2).toUpperCase();
  const age = Number(b.age);
  if (!prenom) erreurs.push("prenom");
  if (!nom) erreurs.push("nom");
  if (!EMAIL.test(email)) erreurs.push("email");
  if (!whatsapp) erreurs.push("whatsapp");
  if (!/^[A-Z]{2}$/.test(pays)) erreurs.push("pays");
  if (!Number.isInteger(age) || age < 13 || age > 99) erreurs.push("age");
  if (typeof b.deux_telephones !== "boolean") erreurs.push("deux_telephones");
  if (b.consentement !== true) erreurs.push("consentement");
  const r = (b.reponses && typeof b.reponses === "object" ? b.reponses : {}) as Record<string, unknown>;
  const reponses: Record<string, string> = {};
  for (const k of CLES_REPONSES) {
    reponses[k] = String(r[k] ?? "").trim().slice(0, 1000);
    if (!reponses[k]) erreurs.push(k);
  }
  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    valeurs: {
      prenom, nom, email, whatsapp_e164: whatsapp!, pays, age, deux_telephones: b.deux_telephones as boolean, reponses,
      langue: t("langue", 5).toLowerCase() || "en",
    },
  };
}

/** La candidature Join vue comme une candidature de l'OS (mêmes clés de réponses). */
export interface CandidatureJoin {
  prenom: string;
  nom: string;
  email: string;
  pays: string;
  age: number | null;
  deux_telephones: boolean | null;
  reponses: Record<string, string | null | undefined>;
  whatsapp_verifie_at: string | null;
}

export function versCandidatureRuul(c: CandidatureJoin): CandidatureRuul {
  return {
    adulte: c.age == null ? null : c.age >= 18,
    pays: c.pays || null,
    deux_telephones: c.deux_telephones,
    a_telephone: !!c.whatsapp_verifie_at,
    nom: `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || null,
    email: c.email || null,
    reponses: c.reponses ?? {},
    desinscrit_at: null,
  };
}

export const MESSAGE_A_TRAITER = "We'll get back to you within 48h";

/** Les règles de l'OS : rien ne manque → acceptée automatiquement, sinon à traiter (réponse sous 48 h). */
export function decider(c: CandidatureJoin, paysOuverts: Set<string>): { decision: "auto" | "a_traiter"; manques: string[] } {
  const manques = manquesCandidature(versCandidatureRuul(c), paysOuverts);
  return { decision: manques.length ? "a_traiter" : "auto", manques };
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

/** « Monday 30 November » (anglais). */
export function lundiLisible(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------------------------------------------
// Contrat (join-v1)
// ---------------------------------------------------------------------------------------------------------------

export const CONTRAT_VERSION = "join-v1";

export const CONTRAT_RESUME = [
  "You are an independent freelancer, not an employee.",
  "You pay your own taxes and social contributions.",
  "You are paid through Ruul. Our obligation ends when we pay Ruul; any problem with Ruul goes to Ruul support.",
  "The TikTok accounts and all content belong to Vik Studios.",
  "Either side can end this at any time, without notice. Only the posts already made are paid.",
];

export const CONTRAT_TEXTE = `FREELANCE SERVICES AGREEMENT (version ${CONTRAT_VERSION})

Between [COMPANY NAME], registered under SIRET [SIRET], with its registered office at [ADDRESS], trading as "Vik Studios" ("the Company"), and the person signing below ("the Creator").

1. Purpose
The Creator publishes, on TikTok accounts provided or approved by the Company, content prepared by the Company, following the instructions shown in the Creator dashboard.

2. Independent status
The Creator acts as an independent freelancer. Nothing in this agreement creates an employment relationship, a partnership or an agency. The Creator organises their own work and uses their own devices.

3. Taxes and social contributions
The Creator is solely responsible for declaring their income and paying any taxes, social contributions or other charges due in their country of residence.

4. Payment
The Creator is paid per week of published posts, at the rate of their country's pay zone shown on the Join page at the time of signing. Payments are made through Ruul, a third-party payment platform. The Company's payment obligation is fully discharged once the amount is paid to Ruul. Any problem with receiving funds from Ruul (account, identity checks, fees, delays, withdrawals) must be raised with Ruul support directly.

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
The Creator signs electronically. The date, time, IP address and device information are recorded with a copy of this text as proof of signature.

13. Governing law
This agreement is governed by French law. Any dispute falls under the jurisdiction of the competent courts of France.`;

/** Le texte signé tel quel (copie intégrale gardée avec la signature, et son empreinte). */
export function texteContratComplet(): string {
  return `${CONTRAT_RESUME.map((l) => `- ${l}`).join("\n")}\n\n${CONTRAT_TEXTE}`;
}
