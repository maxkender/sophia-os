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

/** Comparaison en temps constant : le temps de réponse ne dit rien du jeton attendu. */
export function jetonValide(fourni: string | null | undefined, attendu: string | null | undefined): boolean {
  if (!attendu || attendu.length < 24 || !fourni) return false;
  const a = new TextEncoder().encode(fourni);
  const b = new TextEncoder().encode(attendu);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/**
 * La route, sans le préfixe : tout ce qui suit le segment `qg` (`/functions/v1/qg/apps` comme `/api/qg/apps` → « apps » ;
 * `/api/qg/control/paie` → « control/paie »).
 */
export function routeQg(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("qg");
  return (i >= 0 ? parts.slice(i + 1) : parts.slice(-1)).join("/");
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
