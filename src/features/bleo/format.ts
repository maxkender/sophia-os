// BLEO — mise en forme des chiffres de la section BLEO.

import { localeDate } from "@/locales/localeDate";

import type { EtatBleo, VerdictContenu } from "./api";

/** Les verdicts d'un contenu, du meilleur au moins bon. */
export const VERDICTS_CONTENU = ["gagnant", "en_attente", "non_gagnant"] as const satisfies readonly VerdictContenu[];

/** Les états BLEO d'un contenu, dans l'ordre de sa vie : à juger, en test, jugé. */
export const ETATS_BLEO = ["a_juger", "en_test", "juge"] as const satisfies readonly EtatBleo[];

/** Vues en court : 950, 12,3 k, 1,4 M. Rien → « — ». */
export function formaterVues(n: number | null | undefined, langue?: string): string {
  if (n == null) return "—";
  const nf = (v: number, d: number) =>
    v.toLocaleString(langue?.startsWith("en") ? "en-GB" : "fr-FR", { maximumFractionDigits: d });
  if (Math.abs(n) >= 1_000_000) return `${nf(n / 1_000_000, 1)} M`;
  if (Math.abs(n) >= 10_000) return `${nf(n / 1_000, 0)} k`;
  if (Math.abs(n) >= 1_000) return `${nf(n / 1_000, 1)} k`;
  return nf(n, 0);
}

/** Une part (0,302) en pourcentage arrondi : « 30 % ». */
export function formaterPart(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "—";
  return `${Math.round(p * 100)} %`;
}

/** `n` sur `total` en pourcentage, sans diviser par zéro. */
export function part(n: number | undefined, total: number | undefined): number | null {
  if (!total || n == null) return null;
  return n / total;
}

export function formaterNombre(n: number | null | undefined, decimales = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

/** Une valeur ou un r à deux décimales fixes : « 1,20 » (« 1.20 » en anglais). Rien → « — ». */
export function formaterValeur(n: number | null | undefined, langue?: string): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(langue?.startsWith("en") ? "en-GB" : "fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Date et heure courtes, heure de Paris. */
export function formaterQuand(iso: string | null | undefined, langue?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(localeDate(langue), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
}

/** Un jour AAAA-MM-JJ en « jeu. 30 oct. ». */
export function formaterJour(jour: string | null | undefined, langue?: string): string {
  if (!jour) return "—";
  const [y, m, d] = jour.split("-").map(Number);
  if (!y || !m || !d) return jour;
  return new Date(y, m - 1, d).toLocaleDateString(localeDate(langue), { weekday: "short", day: "numeric", month: "short" });
}

/** Le message d'une erreur Supabase ou JavaScript. */
export function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Les catégories du plan, dans l'ordre où on les lit. */
export const CATEGORIES_PLAN = [
  "juger",
  "recolte",
  "gagnant_servi",
  "non_gagnant_neuve",
  "non_gagnant_servie",
  "rappel",
] as const;

/** Les portes du rapport qui comptent (booléens), dans l'ordre de la spec. */
export const PORTES = [
  "quota",
  "aucun_creneau_vide",
  "fini_avant",
  "part_juger_ok",
  "non_gagnants_ok",
  "recolte_ok",
  "tests_recents_complets",
  "plan_servi",
  "aucune_tierlist",
  "aucune_repetition",
] as const;
