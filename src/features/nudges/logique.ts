import type { NudgeEnvoye } from "./api";

/** L'état d'une relance : résolue (étape faite), répondu, ou pas encore fait. */
export function etatNudge(n: Pick<NudgeEnvoye, "reponse_at" | "resolu_at">) {
  if (n.resolu_at) return "resolu" as const;
  if (n.reponse_at) return "repondu" as const;
  return "sans_reponse" as const;
}

/** Une étape des relances : les 4 du système du 2 nov. (0402), puis le mercredi. */
export const ETAPES_STATS = ["connexion", "tiktok", "warmup_lance", "warmup_bien_fait", "mercredi"] as const;

/** Les anciens noms (prompt 17) comptent pour l'étape qui les remplace. */
const TYPES_STATS: Record<(typeof ETAPES_STATS)[number], readonly string[]> = {
  connexion: ["connexion", "acces"],
  tiktok: ["tiktok"],
  warmup_lance: ["warmup_lance"],
  warmup_bien_fait: ["warmup_bien_fait", "warmup"],
  mercredi: ["mercredi"],
};

/** L'étape de `recrues_rouges` (acces, tiktok, warmup, mercredi) de chaque ligne. */
const ROUGE_STATS: Record<(typeof ETAPES_STATS)[number], string | null> = {
  connexion: "acces",
  tiktok: "tiktok",
  warmup_lance: null,
  warmup_bien_fait: "warmup",
  mercredi: "mercredi",
};

export interface StatsEtape {
  envoyees: number;
  /** Étapes faites dans les 48 h après la relance, en % des relances envoyées (null : aucune). */
  faites48h: number | null;
  rouges: number;
}

/**
 * Les 3 chiffres de la page Relances, sur 7 jours, par étape (28 oct.) :
 * relances envoyées, étapes faites dans les 48 h (une relance est résolue
 * quand l'étape est faite), recrues passées en rouge.
 */
export function statsRelances(
  nudges: readonly { type: string; envoye_at: string; resolu_at: string | null }[],
  rouges: readonly { etape: string }[],
): Record<(typeof ETAPES_STATS)[number], StatsEtape> {
  const H48 = 48 * 3_600_000;
  return Object.fromEntries(
    ETAPES_STATS.map((e) => {
      const envoyes = nudges.filter((n) => TYPES_STATS[e].includes(n.type));
      const vite = envoyes.filter((n) => n.resolu_at && Date.parse(n.resolu_at) - Date.parse(n.envoye_at) <= H48).length;
      return [
        e,
        {
          envoyees: envoyes.length,
          faites48h: envoyes.length ? Math.round((100 * vite) / envoyes.length) : null,
          rouges: rouges.filter((r) => r.etape === ROUGE_STATS[e]).length,
        },
      ];
    }),
  ) as Record<(typeof ETAPES_STATS)[number], StatsEtape>;
}
