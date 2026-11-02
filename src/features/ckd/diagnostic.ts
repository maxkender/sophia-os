/**
 * Le diagnostic d'un compte en 3 lignes (0362) : posts, vues, verdict, et un
 * badge. Les faits viennent de la base (`ckd_diagnostic`, colonne calculée
 * `diagnostic`) ; ici, seulement la mise en mots. Jumeau Slack :
 * `lignesDiagnosticSlack` (supabase/functions/_shared/ckd.ts).
 */
import type { TFunction } from "i18next";

import { localeDate } from "@/locales/localeDate";

export type BadgeDiagnostic = "ok" | "posts_manquants" | "vues_basses" | "shadowban";

export interface DiagnosticCkd {
  badge: BadgeDiagnostic;
  attendus: number;
  publies: number;
  liens_manquants: string[];
  mediane: number | null;
  mediane_ref: number | null;
  morts: number;
  seuil_mort: number;
  shadowban: boolean;
  /** Médiane sous 20 % de celle du pays (0362). */
  vues_basses?: boolean;
  derniers_morts?: number | null;
  derniers_max?: number | null;
}

export interface LignesDiagnostic {
  badge: BadgeDiagnostic;
  posts: string;
  vues: string;
  verdict: string;
}

function nombre(n: number | null | undefined, langue: string): string {
  return n === null || n === undefined ? "—" : Math.round(n).toLocaleString(langue);
}

/** « 17, 18, 20, 21 oct. » (le mois du dernier jour). */
export function joursCourts(jours: string[], langue: string): string {
  if (jours.length === 0) return "";
  const mois = new Date(`${jours[jours.length - 1]}T12:00:00Z`).toLocaleDateString(localeDate(langue), {
    month: "short",
    timeZone: "UTC",
  });
  return `${jours.map((j) => Number(j.slice(8, 10))).join(", ")} ${mois}`;
}

export function lignesDiagnostic(d: DiagnosticCkd, t: TFunction, langue: string): LignesDiagnostic {
  const manquants = Math.max(0, d.attendus - d.publies);
  const liens = d.liens_manquants ?? [];
  const posts =
    t("ckd.diagnostic.posts", { publies: d.publies, attendus: d.attendus }) +
    (manquants > 0
      ? t("ckd.diagnostic.liensManquants", {
          count: manquants,
          jours: liens.length > 0 ? ` (${joursCourts(liens, langue)})` : "",
        })
      : "");
  const vues =
    t("ckd.diagnostic.vues", { mediane: nombre(d.mediane, langue), ref: nombre(d.mediane_ref, langue) }) +
    (d.morts > 0 ? t("ckd.diagnostic.morts", { count: d.morts, seuil: nombre(d.seuil_mort, langue) }) : "");
  return {
    badge: d.badge,
    posts,
    vues,
    verdict: t(`ckd.diagnostic.verdicts.${d.badge}`),
  };
}
