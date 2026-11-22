/**
 * qg — les règles pures de la route du QG (GET /api/qg/apps) : lecture des paramètres et du jeton.
 * Testées dans qg_test.ts ; la fonction Edge `qg` ne fait que les appliquer puis lire `qg_apps(from, to)`.
 */

/** Une période trop longue rendrait une réponse énorme : 190 jours au plus (un peu plus de 6 mois). */
export const QG_JOURS_MAX = 190;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type PeriodeQg = { ok: true; from: string; to: string } | { ok: false; erreur: string };

/** `from` et `to` obligatoires (AAAA-MM-JJ, jours de Paris), `from` ≤ `to`, au plus QG_JOURS_MAX jours. */
export function lirePeriodeQg(params: URLSearchParams): PeriodeQg {
  const from = (params.get("from") ?? "").trim();
  const to = (params.get("to") ?? "").trim();
  if (!from || !to) return { ok: false, erreur: "from et to sont obligatoires (AAAA-MM-JJ)" };
  if (!dateValide(from) || !dateValide(to)) return { ok: false, erreur: "date invalide (AAAA-MM-JJ attendu)" };
  if (from > to) return { ok: false, erreur: "from doit être avant to" };
  const jours = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (jours > QG_JOURS_MAX) return { ok: false, erreur: `période trop longue (${QG_JOURS_MAX} jours au plus)` };
  return { ok: true, from, to };
}

/** Comparaison en temps constant : le temps de réponse ne dit rien du jeton attendu. Espaces de bord ignorés. */
export function jetonValide(fourni: string | null | undefined, attendu: string | null | undefined): boolean {
  const f = (fourni ?? "").trim();
  const t = (attendu ?? "").trim();
  if (t.length < 16 || !f) return false;
  const a = new TextEncoder().encode(f);
  const b = new TextEncoder().encode(t);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** Le jeton envoyé : en-tête x-qg-token, sinon Authorization: Bearer <jeton>. */
export function jetonDeRequete(h: Headers): string | null {
  const x = h.get("x-qg-token")?.trim();
  if (x) return x;
  const a = h.get("authorization")?.trim() ?? "";
  const m = /^bearer\s+(.+)$/i.exec(a);
  return m ? m[1].trim() : null;
}

/** Pourquoi le jeton est refusé (sans rien dire de sa valeur). */
export function raisonRefus(fourni: string | null, attendu: string | null | undefined): string {
  if ((attendu ?? "").trim().length < 16) return "QG_TOKEN absent ou trop court côté serveur (16 caractères au moins)";
  if (!fourni) return "jeton absent : en-tête x-qg-token (ou Authorization: Bearer)";
  return "jeton différent de QG_TOKEN";
}

/**
 * La route, sans le préfixe : tout ce qui suit le segment `qg` (`/functions/v1/qg/apps` comme `/api/qg/apps` → « apps » ;
 * `/api/qg/control/paie` → « control/paie »).
 */
export function routeQg(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("qg");
  const r = (i >= 0 ? parts.slice(i + 1) : parts.slice(-1)).join("/").toLowerCase();
  return ALIAS_ROUTES[r] ?? r;
}

/** Les noms anglais utilisés par le QG. */
const ALIAS_ROUTES: Record<string, string> = {
  "control/recruitment": "control/recrutement", "control/payroll": "control/paie", "control/pay": "control/paie",
  "control/issues": "control/autres", "control/others": "control/autres", "control/other": "control/autres",
};

/**
 * Un lundi tiré du premier paramètre présent parmi `noms` (une date quelconque est ramenée à son lundi) ; sans
 * paramètre, le lundi par défaut. AAAA-MM-JJ.
 */
export function lundiSouple(params: URLSearchParams, noms: string[], defaut: string): { ok: true; lundi: string } | { ok: false; erreur: string } {
  const v = noms.map((n) => (params.get(n) ?? "").trim()).find(Boolean);
  if (!v) return { ok: true, lundi: defaut };
  if (!dateValide(v)) return { ok: false, erreur: `${noms[0]} invalide (AAAA-MM-JJ attendu)` };
  return { ok: true, lundi: lundiDe(v) };
}

/** Le lundi de la semaine d'une date (AAAA-MM-JJ). */
export function lundiDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Un lundi obligatoire (`cohorte`, `semaine`), AAAA-MM-JJ. */
export function lireLundiQg(params: URLSearchParams, nom: string): { ok: true; lundi: string } | { ok: false; erreur: string } {
  const v = (params.get(nom) ?? "").trim();
  if (!v) return { ok: false, erreur: `${nom} est obligatoire (AAAA-MM-JJ, un lundi)` };
  if (!dateValide(v)) return { ok: false, erreur: `${nom} invalide (AAAA-MM-JJ attendu)` };
  if (new Date(`${v}T00:00:00Z`).getUTCDay() !== 1) return { ok: false, erreur: `${nom} doit être un lundi` };
  return { ok: true, lundi: v };
}

/** Les routes connues et la fonction de la base qui répond à chacune. */
export const ROUTES_QG = ["apps", "control/recrutement", "control/paie", "control/autres"] as const;
export type RouteQg = (typeof ROUTES_QG)[number];
export const estRouteQg = (r: string): r is RouteQg => (ROUTES_QG as readonly string[]).includes(r);
