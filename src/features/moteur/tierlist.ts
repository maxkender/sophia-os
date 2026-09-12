/**
 * Tierlist — le classement unique qui décide du placement des posts.
 *
 * Logique pure (barèmes + table de requalification), partagée avec l'Edge :
 * `supabase/functions/_shared/tierlist.ts` en est la copie Deno, à garder
 * synchro. Les tests vivent dans `tierlist.test.ts`.
 *
 * Un contenu porte UN rang (D < C < B < A < S < S+) et un nombre de passages à
 * effectuer. Quand ces passages sont publiés, il est requalifié sur la moyenne
 * de leurs vues (`m`) et repart avec le compteur de son nouveau rang.
 */
export const TIERS = ["D", "C", "B", "A", "S", "S+"] as const;
export type Tier = (typeof TIERS)[number];

/** Passages à effectuer par rang — un cran = ×2. */
export const PASSAGES_PAR_TIER: Record<Tier, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 4,
  S: 8,
  "S+": 16,
};

/** Un passage qui perce : fait monter en S quel que soit `m`. */
export const SEUIL_PASSAGE_S = 30_000;
/** Un passage qui explose : fait monter en S+ quel que soit `m`. */
export const SEUIL_PASSAGE_S_PLUS = 150_000;

export function estTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

export function passagesPourTier(tier: Tier): number {
  return PASSAGES_PAR_TIER[tier];
}

/**
 * Premier placement depuis la note /100 de la langue source
 * (30 % pertinence + 70 % vues — ex-« ELO »).
 *
 *   note < 55       → non importé (null)
 *   55 ≤ note < 60  → C
 *   60 ≤ note < 70  → B
 *   note ≥ 70       → A
 */
export function tierImport(elo: number, seuil = 55): Tier | null {
  if (!Number.isFinite(elo) || elo < seuil) return null;
  if (elo >= 70) return "A";
  if (elo >= 60) return "B";
  return "C";
}

/**
 * Conversion de l'ancien ELO de la langue native en rang, pour les posts
 * déjà en base au moment du passage à la tierlist (migration 0237).
 */
export function tierDepuisEloExistant(elo: number): Tier {
  if (elo >= 89) return "S+";
  if (elo >= 85) return "S";
  if (elo >= 75) return "A";
  if (elo >= 65) return "B";
  if (elo >= 55) return "C";
  return "D";
}

export interface RequalifEntree {
  tier: Tier;
  /** `m` — moyenne des vues des passages publiés du cycle (hors rappels). */
  moyenne: number;
  /** Meilleur passage du cycle. */
  maxVues: number;
  /** Nombre de passages du cycle au-dessus de 150k. */
  nb150k: number;
}

export interface RequalifSortie {
  tier: Tier;
  /** Règle appliquée, pour le journal / l'UI. */
  regle: string;
}

/**
 * Table de requalification.
 *
 * Les règles « un passage à plus de 30k / 150k » sont prioritaires sur `m` :
 * un seul passage qui perce suffit à monter, même si la moyenne est basse.
 */
export function requalifier(e: RequalifEntree): RequalifSortie {
  const { tier, moyenne: m, maxVues, nb150k } = e;
  const perce150k = maxVues >= SEUIL_PASSAGE_S_PLUS;
  const perce30k = maxVues >= SEUIL_PASSAGE_S;

  switch (tier) {
    case "D":
      // Un D n'a 0 passage que tant qu'il dort ; repêché, il en fait un.
      if (m >= 5_000) return { tier: "A", regle: "m ≥ 5 000" };
      if (m >= 1_000) return { tier: "B", regle: "1 000 ≤ m < 5 000" };
      if (m >= 600) return { tier: "C", regle: "600 ≤ m < 1 000" };
      return { tier: "D", regle: "m < 600" };

    case "C":
      if (perce30k) return { tier: "S", regle: "un passage ≥ 30 000" };
      if (m >= 5_000) return { tier: "A", regle: "5 000 ≤ m < 30 000" };
      if (m >= 1_000) return { tier: "B", regle: "1 000 ≤ m < 5 000" };
      if (m >= 600) return { tier: "C", regle: "600 ≤ m < 1 000" };
      return { tier: "D", regle: "m < 600" };

    case "B":
      if (perce150k) return { tier: "S+", regle: "un passage ≥ 150 000" };
      if (perce30k) return { tier: "S", regle: "un passage ≥ 30 000" };
      if (m >= 5_000) return { tier: "A", regle: "5 000 ≤ m < 30 000" };
      if (m >= 1_000) return { tier: "B", regle: "1 000 ≤ m < 5 000" };
      return { tier: "C", regle: "m < 1 000" };

    case "A":
      if (perce150k) return { tier: "S+", regle: "un passage ≥ 150 000" };
      if (perce30k) return { tier: "S", regle: "un passage ≥ 30 000" };
      if (m >= 5_000) return { tier: "A", regle: "5 000 ≤ m < 30 000" };
      return { tier: "B", regle: "m < 5 000" };

    case "S":
      if (perce150k) return { tier: "S+", regle: "un passage ≥ 150 000" };
      if (perce30k) return { tier: "S", regle: "un passage ≥ 30 000" };
      return { tier: "A", regle: "m < 30 000 et aucun passage ≥ 30 000" };

    case "S+":
      if (nb150k >= 2) return { tier: "S+", regle: "deux passages ≥ 150 000" };
      return { tier: "S", regle: "moins de deux passages ≥ 150 000" };
  }
}
