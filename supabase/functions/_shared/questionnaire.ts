/** 15/11 : le questionnaire public : ce qui est accepté du navigateur (rien d'autre n'est gardé). */

const ID = /^[a-z0-9_]{2,40}$/;
const CAPTURES = new Set(["capture_temps", "capture_audience", "capture_abonnements"]);

export function texteCourt(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

/** Les réponses : des clés simples, des textes (2 000 caractères) ou des listes de textes (10 au plus). */
export function nettoyerReponses(v: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 80)) {
    if (!ID.test(k)) continue;
    if (typeof x === "string") {
      const t = x.trim().slice(0, 2000);
      if (t) out[k] = t;
    } else if (Array.isArray(x)) {
      const l = x.filter((e): e is string => typeof e === "string").map((e) => e.trim().slice(0, 200)).filter(Boolean).slice(0, 10);
      if (l.length) out[k] = l;
    }
  }
  return out;
}

export function idCaptureValide(id: string): boolean {
  return CAPTURES.has(id);
}

/** Les captures : par question connue, au plus 3 chemins, et seulement sous le dossier de ce jeton. */
export function capturesValides(v: unknown, prefixe: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!CAPTURES.has(k) || !Array.isArray(x)) continue;
    const l = x.filter((e): e is string => typeof e === "string" && e.startsWith(prefixe) && !e.includes("..") && e.length < 300).slice(0, 3);
    if (l.length) out[k] = l;
  }
  return out;
}
