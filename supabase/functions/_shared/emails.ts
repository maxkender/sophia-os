/**
 * 13/11 (Max) : Brevo n'avait plus de crédits depuis 01:44 UTC et les emails « partaient » sans partir,
 * sans erreur visible. Désormais chaque email de l'OS est écrit dans `emails_envois` :
 *   - accepté par Brevo (message_id) → vérifié ensuite (délivré, rebond, bloqué…) par la fonction `emails` ;
 *   - refus passager (plus de crédit, Brevo indisponible, 429, 5xx…) → remis en file, réessayé plus tard ;
 *   - refus définitif (requête invalide, non autorisé) → noté « refusé » avec sa raison.
 * Quand Brevo est connu sans crédit (réglage `emails_brevo`), l'email va directement en file.
 * Un email en file compte comme envoyé pour l'appelant (ok: true, en_file: true) : la file le garantit,
 * et l'appelant ne le renvoie pas une 2e fois.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

import { urlEmailSite } from "./site.ts";

export interface Message {
  to: string;
  objet: string;
  html: string;
  texte: string;
  /** Le lien de désabonnement (en-tête List-Unsubscribe). */
  stop: string;
  tags: string[];
}

export interface ResultatEnvoi {
  ok: boolean;
  erreur: string | null;
  /** L'email n'est pas parti : il est en file et sera réessayé. */
  en_file?: boolean;
  message_id?: string | null;
}

/** La réponse brute du site (os-email → Brevo). */
export interface ReponseSite {
  ok: boolean;
  status: number;
  message_id: string | null;
  erreur: string | null;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** Le délai avant le prochain essai : 15 min, 30, 1 h, 2 h… plafonné à 6 h. */
export function delaiEssai(tentatives: number): number {
  return Math.min(6 * 60, 15 * 2 ** Math.max(0, tentatives - 1)) * 60_000;
}

/** Au-delà, l'email est abandonné (et Max le voit dans « Aujourd'hui »). */
export const TENTATIVES_MAX = 12;

/**
 * Un refus définitif ne sert à rien d'être réessayé : requête invalide, non autorisé, adresse refusée.
 * Tout le reste (crédit épuisé, 402/429/5xx, réseau, configuration manquante) se réessaie.
 */
export function refusDefinitif(r: ReponseSite): boolean {
  if (r.ok) return false;
  const e = (r.erreur ?? "").toLowerCase();
  if (/credit|quota|limit|unavailable|timeout|missing_message_id|provider_error|not_configured|manquant/.test(e)) return false;
  return r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404 || /invalid_request|unauthorized|invalid_parameter/.test(e);
}

/** L'appel au site (os-email). Ne lève jamais. */
export async function appelerSite(m: Message, fetchFn: typeof fetch = fetch): Promise<ReponseSite> {
  const url = urlEmailSite();
  const secret = Deno.env.get("OS_HUB_SECRET");
  if (!url || !secret) return { ok: false, status: 0, message_id: null, erreur: "HUB_EMAIL_URL ou OS_HUB_SECRET manquant" };
  try {
    const r = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-secret": secret },
      body: JSON.stringify({ action: "envoyer_email", to: m.to, from_name: "Sophia", subject: m.objet, html: m.html, text: m.texte, tags: m.tags, unsubscribe_url: m.stop }),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && j?.ok !== false;
    return { ok, status: r.status, message_id: typeof j?.message_id === "string" ? j.message_id : null, erreur: ok ? null : String(j?.error ?? `HTTP ${r.status}`) };
  } catch (e) {
    return { ok: false, status: 0, message_id: null, erreur: e instanceof Error ? e.message : String(e) };
  }
}

let clientJournal: Db | null | undefined;
/** Le client du journal (service). `null` sans configuration (tests) : on envoie sans journal. */
function journal(): Db | null {
  if (clientJournal !== undefined) return clientJournal;
  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  clientJournal = url && cle ? createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return clientJournal;
}

/** Pour les tests : un journal factice (ou aucun). */
export function _journalPourTests(db: Db | null) {
  clientJournal = db;
  cacheBrevo = null;
}

let cacheBrevo: { at: number; sansCredit: boolean } | null = null;
/** Brevo est-il connu sans crédit (réglage emails_brevo, relevé par la fonction `emails`) ? */
export async function brevoSansCredit(db: Db): Promise<boolean> {
  if (cacheBrevo && Date.now() - cacheBrevo.at < 60_000) return cacheBrevo.sansCredit;
  let sansCredit = false;
  try {
    const { data } = await db.from("reglages").select("valeur").eq("cle", "emails_brevo").maybeSingle();
    sansCredit = data?.valeur?.sans_credit === true;
  } catch { /* lecture impossible : on tente l'envoi */ }
  cacheBrevo = { at: Date.now(), sansCredit };
  return sansCredit;
}

async function ecrire(db: Db, ligne: Record<string, unknown>) {
  try {
    const { error } = await db.from("emails_envois").insert(ligne);
    if (error) console.error("emails_envois", error.message);
  } catch (e) {
    console.error("emails_envois", e instanceof Error ? e.message : String(e));
  }
}

/**
 * L'envoi suivi : le seul chemin des emails de l'OS vers le site (et Brevo).
 * Le contenu est gardé tant que l'email n'est pas délivré (pour le réessayer), puis effacé.
 */
export async function envoyerSuivi(m: Message, fetchFn: typeof fetch = fetch): Promise<ResultatEnvoi> {
  const db = journal();
  const base = { destinataire: m.to, objet: m.objet, html: m.html, texte: m.texte, desabonnement: m.stop, tags: m.tags };
  if (db && await brevoSansCredit(db)) {
    await ecrire(db, { ...base, statut: "en_file", erreur: "Brevo sans crédit", prochain_essai_at: new Date().toISOString() });
    return { ok: true, en_file: true, erreur: "en file : Brevo sans crédit" };
  }
  const r = await appelerSite(m, fetchFn);
  const maintenant = new Date();
  if (r.ok) {
    if (db) await ecrire(db, { ...base, statut: "accepte", message_id: r.message_id, tentatives: 1, accepte_at: maintenant.toISOString() });
    return { ok: true, erreur: null, message_id: r.message_id };
  }
  if (!db) return { ok: false, erreur: r.erreur };
  if (refusDefinitif(r)) {
    await ecrire(db, { ...base, statut: "refuse", erreur: r.erreur, tentatives: 1 });
    return { ok: false, erreur: r.erreur };
  }
  await ecrire(db, { ...base, statut: "en_file", erreur: r.erreur, tentatives: 1, prochain_essai_at: new Date(maintenant.getTime() + delaiEssai(1)).toISOString() });
  return { ok: true, en_file: true, erreur: `en file : ${r.erreur}` };
}

// ---------------------------------------------------------------------------
// Brevo (lecture seule) : crédits, événements, contenu d'un email envoyé.
// ---------------------------------------------------------------------------

const BREVO = "https://api.brevo.com/v3";

export async function brevoGet(chemin: string, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; status: number; data: unknown; erreur: string | null }> {
  const cle = Deno.env.get("BREVO_API_KEY");
  if (!cle) return { ok: false, status: 0, data: null, erreur: "BREVO_API_KEY manquant" };
  try {
    const r = await fetchFn(`${BREVO}${chemin}`, { headers: { "api-key": cle, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data, erreur: r.ok ? null : String((data as { code?: unknown; message?: unknown } | null)?.code ?? `HTTP ${r.status}`) };
  } catch (e) {
    return { ok: false, status: 0, data: null, erreur: e instanceof Error ? e.message : String(e) };
  }
}

export interface PlanBrevo {
  type?: string;
  creditsType?: string;
  credits?: number;
}

/**
 * Les crédits email de Brevo (GET /account). `null` si on ne sait pas lire (on ne bloque rien).
 * Les lignes SMS ne comptent pas ; plusieurs plans email (abonnement + pack) s'additionnent.
 */
export function creditsEmail(plan: unknown): number | null {
  if (!Array.isArray(plan)) return null;
  const emails = (plan as PlanBrevo[]).filter((p) => typeof p?.credits === "number" && !/sms|whatsapp/i.test(`${p.type ?? ""} ${p.creditsType ?? ""}`));
  if (emails.length === 0) return null;
  return emails.reduce((s, p) => s + Math.max(0, p.credits ?? 0), 0);
}

export interface EvenementBrevo {
  email?: string;
  date?: string;
  messageId?: string;
  event?: string;
  reason?: string;
  subject?: string;
  tag?: string;
}

export type StatutLivraison = "delivre" | "refuse" | "a_reessayer" | "en_attente";

/**
 * Ce que disent les événements Brevo d'UN email :
 *   - délivré (ou ouvert, cliqué) → délivré ;
 *   - rebond dur, adresse invalide, bloqué, spam → refusé (définitif) ;
 *   - erreur, rebond doux → à réessayer ;
 *   - sinon (seulement « requests », « deferred ») → en attente.
 */
export function statutLivraison(evenements: EvenementBrevo[]): { statut: StatutLivraison; evenement: string | null; raison: string | null } {
  const par = (noms: string[]) => evenements.find((e) => noms.includes(String(e.event ?? "").toLowerCase()));
  const ok = par(["delivered", "opened", "clicks", "click", "uniqueopened", "loadedbyproxy", "proxy_open", "unique_proxy_open"]);
  if (ok) return { statut: "delivre", evenement: String(ok.event), raison: null };
  const dur = par(["hardbounces", "hard_bounce", "hardbounce", "invalid", "invalid_email", "blocked", "spam", "complaint"]);
  if (dur) return { statut: "refuse", evenement: String(dur.event), raison: dur.reason ?? null };
  const passager = par(["error", "softbounces", "soft_bounce", "softbounce"]);
  if (passager) return { statut: "a_reessayer", evenement: String(passager.event), raison: passager.reason ?? null };
  const dernier = evenements[0];
  return { statut: "en_attente", evenement: dernier?.event ? String(dernier.event) : null, raison: dernier?.reason ?? null };
}

/** Les événements Brevo d'un message_id (ou d'une adresse sur une période). */
export async function evenementsBrevo(
  q: { messageId?: string; email?: string; startDate?: string; endDate?: string; tags?: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; evenements: EvenementBrevo[]; erreur: string | null }> {
  const p = new URLSearchParams({ limit: "500", sort: "desc" });
  if (q.messageId) p.set("messageId", q.messageId);
  if (q.email) p.set("email", q.email);
  if (q.startDate) p.set("startDate", q.startDate);
  if (q.endDate) p.set("endDate", q.endDate);
  if (q.tags) p.set("tags", q.tags);
  if (!q.startDate && !q.endDate) p.set("days", "30");
  const r = await brevoGet(`/smtp/statistics/events?${p}`, fetchFn);
  if (!r.ok) return { ok: false, evenements: [], erreur: r.erreur };
  const ev = (r.data as { events?: EvenementBrevo[] } | null)?.events;
  return { ok: true, evenements: Array.isArray(ev) ? ev : [], erreur: null };
}

/** Le lien « I do not wish to continue » d'un email déjà rendu (pour le List-Unsubscribe d'un renvoi). */
export function lienStopDansHtml(html: string): string | null {
  const m = html.match(/https:\/\/[^"'\s<>]*\/r\/stop\?t=[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}

/** Le texte brut d'un email HTML (pour un renvoi dont seul le HTML est connu). */
export function texteDepuisHtml(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_t, href, txt) => `${txt.replace(/<[^>]+>/g, "")}: ${href}`)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.trim()).filter((l, i, a) => l || (a[i - 1] ?? "") !== "").join("\n").trim();
}
