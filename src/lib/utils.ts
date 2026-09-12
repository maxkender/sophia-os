import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Message lisible d'une erreur, y compris celles de Supabase.
 *
 * Les erreurs PostgREST ne sont pas des `Error` mais des objets plats
 * (`{ message, details, hint, code }`) : `String(e)` donnait « [object Object] »
 * dans l'UI, ce qui ne laisse rien à diagnostiquer. On recompose le message,
 * avec le code quand il est là (300 = embed ambigu, 42703 = colonne inconnue…).
 */
export function messageErreur(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const bouts = [o.message, o.details, o.hint]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    const texte = bouts.join(" · ");
    const code = typeof o.code === "string" && o.code ? ` (${o.code})` : "";
    if (texte) return texte + code;
    if (code) return `erreur${code}`;
  }
  return "erreur inconnue";
}
