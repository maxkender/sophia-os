/**
 * Un seul tag d'étape par compte, les mêmes mots partout (page Posters,
 * dashboard HM, Cohort tracking) :
 *
 *   Account not created → Not warming up → Warming up → Ready
 *   → Posting · week N → Stopped / Dormant
 *
 * « Stopped » : arrêté pour de bon (ne pas renouveler, arrêt de Check, Kill or
 * Double). « Dormant » : désactivé autrement, en veille et réactivable — le mot
 * que la page Posters employait déjà.
 *
 * et, à part, un tag de qualité pour les comptes qui postent : GOOD /
 * POOR VIEWS / SHADOWBAN (Check, Kill or Double → Shadowban, 0362).
 */
import { lundiDe } from "@/features/moteur/semaines";

export type Etape = "not_created" | "not_warming_up" | "warming_up" | "ready" | "posting" | "dormant" | "stopped";

/** L'ordre des compteurs et des filtres. */
export const ETAPES: readonly Etape[] = [
  "not_created",
  "not_warming_up",
  "warming_up",
  "ready",
  "posting",
  "dormant",
  "stopped",
];

export type Qualite = "good" | "poor_views" | "shadowban";

export interface EtatEtape {
  etape: Etape;
  /** « Posting · week N » : la semaine de posts, 1 = la première. */
  semaine: number | null;
}

export interface EntreeEtape {
  /** Pas de compte dans l'OS : « Account not created ». */
  compteId?: string | null;
  isActive?: boolean | null;
  /** Arrêté pour de bon (ne pas renouveler, arrêt fait) : « Stopped ». */
  arrete?: boolean | null;
  warmupStartedAt?: string | null;
  warmupEndsAt?: string | null;
  /** Le compte TikTok existe (relevé, profil lu ou post publié) ; null : inconnu. */
  tiktokExiste?: boolean | null;
  /** Premier jour de posts prévu (AAAA-MM-JJ). */
  premierJour?: string | null;
}

function jours(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

export function etapeCompte(e: EntreeEtape, aujourdhui: string, maintenant: Date = new Date()): EtatEtape {
  const rien = { semaine: null };
  if (!e.compteId) return { etape: "not_created", ...rien };
  if (e.isActive === false) return { etape: e.arrete ? "stopped" : "dormant", ...rien };
  if (!e.warmupStartedAt || !e.warmupEndsAt) {
    return { etape: e.tiktokExiste ? "not_warming_up" : "not_created", ...rien };
  }
  if (new Date(e.warmupEndsAt).getTime() > maintenant.getTime()) return { etape: "warming_up", ...rien };
  if (!e.premierJour || e.premierJour > aujourdhui) return { etape: "ready", ...rien };

  return { etape: "posting", semaine: Math.floor(jours(lundiDe(e.premierJour), aujourdhui) / 7) + 1 };
}

/** La qualité n'a de sens que pour un compte qui poste. */
export function qualiteAffichee(etat: EtatEtape, qualite: Qualite | null | undefined): Qualite | null {
  return etat.etape === "posting" ? (qualite ?? null) : null;
}

export type CompteursEtapes = Record<Etape, number>;

export function compterEtapes(etats: EtatEtape[]): CompteursEtapes {
  const c = Object.fromEntries(ETAPES.map((e) => [e, 0])) as CompteursEtapes;
  for (const e of etats) c[e.etape] += 1;
  return c;
}
