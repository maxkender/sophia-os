/**
 * Un seul tag d'étape par compte, les mêmes mots partout (page Posters,
 * dashboard HM, Cohort tracking) :
 *
 *   Account not created → Not warming up → Warming up · 3d 4h left → Ready
 *   → Posting · week N (ou Inactive · last post 15 Oct) → Stopped / Dormant
 *
 * « Inactive » : le compte devrait poster, mais aucun post publié depuis plus
 * de 4 jours (JOURS_INACTIF), ou aucun depuis son premier jour.
 *
 * « Stopped » : arrêté pour de bon (ne pas renouveler, arrêt de Check, Kill or
 * Double). « Dormant » : désactivé autrement, en veille et réactivable — le mot
 * que la page Posters employait déjà.
 *
 * et, à part, un tag de qualité pour les comptes qui postent : GOOD /
 * POOR VIEWS / SHADOWBAN (Check, Kill or Double → Shadowban, 0362).
 */
import { lundiDe } from "@/features/moteur/semaines";

export type Etape =
  | "not_created"
  | "not_warming_up"
  | "warming_up"
  | "ready"
  | "posting"
  | "inactive"
  | "dormant"
  | "stopped";

/** L'ordre des compteurs et des filtres. */
export const ETAPES: readonly Etape[] = [
  "not_created",
  "not_warming_up",
  "warming_up",
  "ready",
  "posting",
  "inactive",
  "dormant",
  "stopped",
];

/** Plus de 4 jours sans post publié : « Inactive ». */
export const JOURS_INACTIF = 4;

export type Qualite = "good" | "poor_views" | "shadowban";

export interface EtatEtape {
  etape: Etape;
  /** « Posting · week N » : la semaine de posts, 1 = la première. */
  semaine: number | null;
  /** « Inactive » : le dernier post publié (AAAA-MM-JJ), null s'il n'y en a aucun. */
  dernierPost?: string | null;
  /** « Warming up » : la fin du warm-up, pour le temps restant. */
  warmupFin?: string | null;
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
  /**
   * Dernier jour avec un post publié (AAAA-MM-JJ), null : aucun. Absent
   * (undefined) : on ne sait pas, et « Inactive » n'est jamais déduit.
   */
  dernierPublie?: string | null;
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
  if (new Date(e.warmupEndsAt).getTime() > maintenant.getTime()) {
    return { etape: "warming_up", ...rien, warmupFin: e.warmupEndsAt };
  }
  // Warm-up fini mais le compte TikTok introuvable au dernier relevé, et aucun
  // post publié (un post publié prouve qu'il existe) : pas encore créé.
  if (e.tiktokExiste === false && !e.dernierPublie) return { etape: "not_created", ...rien };
  if (!e.premierJour || e.premierJour > aujourdhui) return { etape: "ready", ...rien };

  const semaine = Math.floor(jours(lundiDe(e.premierJour), aujourdhui) / 7) + 1;
  if (e.dernierPublie !== undefined) {
    // Sans aucun post, on compte depuis le premier jour prévu.
    const depuis = e.dernierPublie && e.dernierPublie >= e.premierJour ? e.dernierPublie : e.premierJour;
    if (jours(depuis, aujourdhui) > JOURS_INACTIF) {
      return { etape: "inactive", semaine, dernierPost: e.dernierPublie };
    }
  }
  return { etape: "posting", semaine };
}

/** Temps restant jusqu'à `fin` : jours et heures entiers (heures arrondies au-dessus). */
export function tempsRestant(fin: string, maintenant: Date = new Date()): { jours: number; heures: number } {
  const heures = Math.max(0, Math.ceil((new Date(fin).getTime() - maintenant.getTime()) / 3_600_000));
  return { jours: Math.floor(heures / 24), heures: heures % 24 };
}

/** La qualité n'a de sens que pour un compte qui poste (ou devrait poster). */
export function qualiteAffichee(etat: EtatEtape, qualite: Qualite | null | undefined): Qualite | null {
  return etat.etape === "posting" || etat.etape === "inactive" ? (qualite ?? null) : null;
}

export type CompteursEtapes = Record<Etape, number>;

export function compterEtapes(etats: EtatEtape[]): CompteursEtapes {
  const c = Object.fromEntries(ETAPES.map((e) => [e, 0])) as CompteursEtapes;
  for (const e of etats) c[e.etape] += 1;
  return c;
}
