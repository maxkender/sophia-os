/**
 * 17/11 (Max) : l'API publique de Ruul (https://web-service.ruul.io/api-docs).
 *
 * Auth : en-tête x-api-key. La clé ne vit QUE dans les secrets des fonctions :
 *   prod    → RUUL_API_KEY            (https://web-service.ruul.io)
 *   sandbox → RUUL_SANDBOX_API_KEY    (https://web-service.sandbox.ruul.io)
 * Jamais en base, jamais dans le front, jamais dans un journal.
 * Limites Ruul : lectures 10/s · 50/min · 200/h ; écritures (payouts) 2/s · 10/min · 100/h ; connect 5/s.
 */

export type EnvRuul = "prod" | "sandbox";

export const BASES: Record<EnvRuul, string> = {
  prod: "https://web-service.ruul.io",
  sandbox: "https://web-service.sandbox.ruul.io",
};

export function cleRuul(env: EnvRuul): string | null {
  return Deno.env.get(env === "prod" ? "RUUL_API_KEY" : "RUUL_SANDBOX_API_KEY")?.trim() || null;
}

export function secretWebhookRuul(env: EnvRuul): string | null {
  return Deno.env.get(env === "prod" ? "RUUL_WEBHOOK_SECRET" : "RUUL_SANDBOX_WEBHOOK_SECRET")?.trim() || null;
}

export type Onboarding = "NOT_REGISTERED" | "PENDING_KYC" | "PENDING_COLLECTION_ACCOUNT" | "PENDING_AGREEMENTS" | "READY";

/** Le même ordre que Ruul (NOT_REGISTERED → PENDING_KYC → PENDING_COLLECTION_ACCOUNT → READY) ; miroir de ruul_onboarding_de. */
export function onboardingDe(statut: string | null | undefined, kyc: string | null | undefined, banque: boolean | null | undefined): Onboarding {
  if (!statut || statut.toUpperCase() === "NOT_REGISTERED") return "NOT_REGISTERED";
  if ((kyc ?? "").toUpperCase() !== "APPROVED") return "PENDING_KYC";
  if (!banque) return "PENDING_COLLECTION_ACCOUNT";
  return "READY";
}

export interface ReponseRuul<T> {
  ok: boolean;
  http: number;
  data: T | null;
  code: string | null;
  erreur: string | null;
  duree_ms: number;
}

/** Un appel à Ruul. Ne lève jamais : l'erreur revient dans `erreur` (le message de Ruul, sans la clé). */
export async function appelRuul<T>(
  env: EnvRuul,
  methode: "GET" | "POST",
  chemin: string,
  o: { corps?: unknown; idempotence?: string; query?: Record<string, string | number | undefined> } = {},
): Promise<ReponseRuul<T>> {
  const cle = cleRuul(env);
  const debut = Date.now();
  if (!cle) return { ok: false, http: 0, data: null, code: "cle_absente", erreur: `secret ${env === "prod" ? "RUUL_API_KEY" : "RUUL_SANDBOX_API_KEY"} absent`, duree_ms: 0 };
  const url = new URL(`${BASES[env]}/api/ruul-api${chemin}`);
  for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const entetes: Record<string, string> = { "x-api-key": cle, accept: "application/json" };
  if (o.corps !== undefined) entetes["content-type"] = "application/json";
  if (o.idempotence) entetes["Idempotency-Key"] = o.idempotence;
  try {
    const r = await fetch(url, { method: methode, headers: entetes, body: o.corps === undefined ? undefined : JSON.stringify(o.corps) });
    const texte = await r.text();
    let corps: unknown = null;
    try {
      corps = texte ? JSON.parse(texte) : null;
    } catch {
      corps = null;
    }
    const duree_ms = Date.now() - debut;
    if (r.ok) return { ok: true, http: r.status, data: corps as T, code: null, erreur: null, duree_ms };
    const e = (corps ?? {}) as { code?: string; message?: string | string[] };
    const message = Array.isArray(e.message) ? e.message.join(" ; ") : e.message;
    return { ok: false, http: r.status, data: corps as T, code: e.code ?? null, erreur: (message ?? texte.slice(0, 300)) || `HTTP ${r.status}`, duree_ms };
  } catch (err) {
    return { ok: false, http: 0, data: null, code: "reseau", erreur: err instanceof Error ? err.message : String(err), duree_ms: Date.now() - debut };
  }
}

// --- Webhooks (phase 4) ---------------------------------------------------------------------------

/** `Ruul-Signature: t=<unix s>,v1=<hex HMAC-SHA256 de "<t>.<corps brut>">`, rejet au-delà de 5 min. */
export async function signatureRuulValide(corpsBrut: string, entete: string | null, secret: string, maintenantS = Date.now() / 1000): Promise<boolean> {
  if (!entete || !secret) return false;
  const parts = Object.fromEntries(entete.split(",").map((p) => {
    const i = p.indexOf("=");
    return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
  const t = Number(parts.t);
  const v1 = String(parts.v1 ?? "");
  if (!Number.isFinite(t) || !v1 || Math.abs(maintenantS - t) > 300) return false;
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${parts.t}.${corpsBrut}`)));
  const attendu = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  if (attendu.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// --- Paie (phase 3) -------------------------------------------------------------------------------

/** « Vik Studios — week of Nov 16 » (jamais « bot », jamais « Sophia »). */
export function semaineEnAnglais(lundi: string): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function descriptionLot(lundi: string): string {
  return `Vik Studios — week of ${semaineEnAnglais(lundi)}`;
}

export function descriptionLigne(lundi: string, posts: number, bonus: number): string {
  const b = bonus > 0 ? ` + ${Math.round(bonus * 100) / 100} $ bonus` : "";
  return `Vik Studios — week of ${semaineEnAnglais(lundi)} : ${posts} post${posts === 1 ? "" : "s"}${b}`;
}

// --- Pagination de GET /workmates (27/11) ---------------------------------------------------------

/** Taille d'une page de GET /workmates (Ruul : 100 au plus, 27/11). */
export const PAGE_WORKMATES = 100;
/** Garde-fou : 50 pages = 5 000 posteurs. */
export const PAGES_WORKMATES_MAX = 50;

/** Faut-il lire la page suivante ? Pure (testée). */
export function pageSuivanteWorkmates(total: number | null, lus: number, cumul: number, page: number): boolean {
  if (total === null) return false;
  if (lus === 0 || lus < PAGE_WORKMATES) return false;
  if (cumul >= total) return false;
  return page < PAGES_WORKMATES_MAX;
}
