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

// ---------------------------------------------------------------------------
// Priorité au tirage du jour
// ---------------------------------------------------------------------------

/**
 * Rang plancher de la bande servie en priorité au tirage du jour.
 *
 * Un post sous ce plancher — un C, ou un D encore porteur d'un passage repêché
 * — n'est tiré que si le pool du compte n'a plus **aucun** post en B ou
 * au-dessus. Le bas de tierlist ne sert qu'à combler les créneaux restants.
 */
export const TIER_MIN_PRIORITAIRE: Tier = "B";

/** Position dans l'échelle D < C < B < A < S < S+. */
export function rangTier(tier: Tier): number {
  return TIERS.indexOf(tier);
}

/** Le post est-il dans la bande servie en premier (≥ `TIER_MIN_PRIORITAIRE`) ? */
export function estTierPrioritaire(tier: Tier): boolean {
  return rangTier(tier) >= rangTier(TIER_MIN_PRIORITAIRE);
}

export interface CandidatTirage {
  tier: Tier;
  /** Ce compte a déjà posté ce contenu. */
  dejaPoste?: boolean;
}

/**
 * Découpe le pool du jour en bandes, dans l'ordre où elles doivent être servies :
 *
 *   1. B+ jamais posté par ce compte
 *   2. B+ déjà posté
 *   3. C (ou D repêché) jamais posté
 *   4. C (ou D repêché) déjà posté
 *
 * Le rang passe donc avant la fraîcheur : un B déjà vu par le compte est servi
 * avant un C neuf. Le tirage reste uniforme **à l'intérieur** d'une bande.
 */
export function bandesDeTirage<T extends CandidatTirage>(pool: T[]): T[][] {
  const bandes: T[][] = [[], [], [], []];
  for (const c of pool) {
    const bande = (estTierPrioritaire(c.tier) ? 0 : 2) + (c.dejaPoste ? 1 : 0);
    bandes[bande].push(c);
  }
  return bandes;
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

// ---------------------------------------------------------------------------
// Étalement des rappels J+7
// ---------------------------------------------------------------------------

/** Jour ISO (`YYYY-MM-DD`) suivant — arithmétique en UTC, sans fuseau. */
export function jourSuivant(jour: string): string {
  return new Date(Date.parse(`${jour}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export interface CandidatRappel {
  /** Passage source — sert d'ancre stable au tri à date égale. */
  id: string;
  compteId: string;
  /** Jour de publication de la source, ISO. */
  publieLe: string;
  /** Jour visé avant arbitrage : `publieLe` + `rappel_jours`. */
  jourCible: string;
}

export interface PlacementRappel extends CandidatRappel {
  /** Jour retenu : ≥ `jourCible`, ≥ `premierJour`, et sous le quota du compte. */
  jour: string;
}

export interface EtalementRappels {
  /** Premier jour ouvrable — en pratique demain, le jour même étant figé. */
  premierJour: string;
  /** Places d'un compte pour une journée (`comptes.posts_par_jour`). */
  quota: (compteId: string) => number;
  /** Passages déjà posés ce jour-là sur ce compte, rappels compris. */
  occupation?: (compteId: string, jour: string) => number;
}

/**
 * Répartit les rappels sur les jours à venir sans jamais dépasser le quota
 * quotidien d'un compte.
 *
 * Un rappel **prend la place** d'un post classique : un créateur à 2 posts/jour
 * qui a deux rappels le même jour ne reçoit aucun contenu neuf ce jour-là — et
 * jamais un troisième post. Le surplus glisse au premier jour qui a de la place.
 *
 * Sans cet étalement, une reprise d'historique (le scan remonte 30 jours) fait
 * tomber tous les J+7 échus sur le même lendemain : c'est ce qui a donné 9 posts
 * en un jour à un compte qui en prévoit 2.
 *
 * Les plus anciens passent en premier — un rappel en retard ne double pas les
 * suivants.
 */
export function etalerRappels(
  candidats: CandidatRappel[],
  opts: EtalementRappels,
): PlacementRappel[] {
  const pris = new Map<string, number>();
  const cle = (compteId: string, jour: string) => `${compteId}@${jour}`;
  const occupe = (compteId: string, jour: string): number => {
    const k = cle(compteId, jour);
    if (!pris.has(k)) pris.set(k, opts.occupation?.(compteId, jour) ?? 0);
    return pris.get(k)!;
  };

  const ordonnes = [...candidats].sort((a, b) =>
    a.publieLe === b.publieLe
      ? a.id.localeCompare(b.id)
      : a.publieLe.localeCompare(b.publieLe)
  );

  const places: PlacementRappel[] = [];
  for (const c of ordonnes) {
    // Plancher 1 : un quota à 0 boucherait la boucle sans jamais poser le rappel.
    const quota = Math.max(1, Math.round(opts.quota(c.compteId) || 0));
    let jour = c.jourCible < opts.premierJour ? opts.premierJour : c.jourCible;
    while (occupe(c.compteId, jour) >= quota) jour = jourSuivant(jour);
    pris.set(cle(c.compteId, jour), occupe(c.compteId, jour) + 1);
    places.push({ ...c, jour });
  }
  return places;
}
