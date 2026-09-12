import { serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/**
 * Tierlist — le classement unique qui remplace l'ELO par langue.
 *
 * La partie pure (barèmes + `tierImport` + `requalifier`) est une copie Deno de
 * `src/features/moteur/tierlist.ts`, où vivent les tests — garder synchro.
 *
 * Un contenu porte UN rang (D < C < B < A < S < S+) et un nombre de passages à
 * effectuer. Quand les passages du cycle sont publiés (et ont pris un jour de
 * recul), le contenu est requalifié sur la moyenne des vues de ces passages (`m`)
 * et repart avec le compteur de son nouveau rang.
 *
 * L'ELO ne sert plus qu'au tout premier placement, à l'import (voir
 * `tierImport` ci-dessous). Les comptes, eux, portent une case de classement
 * (INACTIF → STAR) — voir `_shared/classement_comptes.ts`.
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

// ---------------------------------------------------------------------------
// Premier placement — à l'import
// ---------------------------------------------------------------------------

/**
 * Premier placement depuis la note /100 de la langue source
 * (30 % pertinence + 70 % vues — ex-« ELO »).
 * Sous le seuil (55 par défaut) : pas d'import du tout → `null`.
 *
 *   ELO < 55       → non importé
 *   55 ≤ ELO < 60  → C
 *   60 ≤ ELO < 70  → B
 *   ELO ≥ 70       → A
 */
export function tierImport(elo: number, seuil = 55): Tier | null {
  if (!Number.isFinite(elo) || elo < seuil) return null;
  if (elo >= 70) return "A";
  if (elo >= 60) return "B";
  return "C";
}

// ---------------------------------------------------------------------------
// Requalification
// ---------------------------------------------------------------------------

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
  /** Moyenne des vues des passages publiés du cycle (hors rappels). */
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
// Réglages
// ---------------------------------------------------------------------------

export interface TierlistReglages {
  /** Jours de recul minimum sur le dernier passage publié avant de requalifier. */
  reculJours: number;
  /** Vues d'un passage qui déclenchent le rappel automatique sur le même compte. */
  rappelVues: number;
  /** Décalage du rappel après la publication du passage source. */
  rappelJours: number;
  /** Rappels enchaînés maximum (un rappel > 50k peut en redéclencher un). */
  rappelMax: number;
  /** Remix débloqués à chaque requalification en S+. */
  remixParRequalif: number;
  /** Passages offerts à un contenu en D repêché pour combler le pool. */
  repechagePassages: number;
}

export async function chargerTierlistReglages(
  supabase: Supabase,
): Promise<TierlistReglages> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "tierlist")
    .maybeSingle();
  const v = (data?.valeur ?? {}) as Record<string, number>;
  return {
    reculJours: v.recul_jours ?? 1,
    rappelVues: v.rappel_vues ?? 50_000,
    rappelJours: v.rappel_jours ?? 7,
    rappelMax: v.rappel_max ?? 3,
    remixParRequalif: v.remix_par_requalif ?? 3,
    repechagePassages: v.repechage_passages ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Run de requalification (minuit)
// ---------------------------------------------------------------------------

export interface TierEtat {
  contenu_id: string;
  tier: Tier;
  passages_prevus: number;
  tier_cycle: number;
  publies: number;
  en_vol: number;
  restants: number;
  moyenne_vues: number | null;
  max_vues: number | null;
  nb_150k: number;
  dernier_publie_at: string | null;
}

export interface RequalifDetail {
  contenuId: string;
  titre: string;
  avant: Tier;
  apres: Tier;
  moyenne: number;
  maxVues: number;
  passages: number;
  regle: string;
  remix: number;
}

export interface RequalificationResultat {
  examines: number;
  requalifies: number;
  enAttente: number;
  remixDebloques: number;
  details: RequalifDetail[];
}

/**
 * Requalifie tous les contenus dont le cycle est terminé.
 *
 * Un cycle est terminé quand tous les passages prévus sont **publiés** (un
 * passage assigné mais jamais publié n'est pas consommé — il revient au pool)
 * et que le dernier publié a pris `reculJours` jour(s), le temps que les vues
 * remontent.
 */
export async function requalifierContenus(
  supabase: Supabase,
  opts: { dryRun?: boolean; contenuId?: string | null } = {},
): Promise<RequalificationResultat> {
  const reglages = await chargerTierlistReglages(supabase);
  const dryRun = Boolean(opts.dryRun);

  let q = supabase
    .from("contenu_tier_etat")
    .select(
      "contenu_id, tier, passages_prevus, tier_cycle, publies, en_vol, restants, moyenne_vues, max_vues, nb_150k, dernier_publie_at",
    )
    .gt("passages_prevus", 0);
  if (opts.contenuId) q = q.eq("contenu_id", opts.contenuId);

  const { data, error } = await q;
  if (error) throw error;
  const etats = (data ?? []) as TierEtat[];

  const out: RequalificationResultat = {
    examines: etats.length,
    requalifies: 0,
    enAttente: 0,
    remixDebloques: 0,
    details: [],
  };

  const mursOk: TierEtat[] = [];
  const reculMs = reglages.reculJours * 86_400_000;
  for (const e of etats) {
    if (e.publies < e.passages_prevus) {
      out.enAttente += 1;
      continue;
    }
    const dernier = e.dernier_publie_at ? Date.parse(e.dernier_publie_at) : NaN;
    if (Number.isFinite(dernier) && Date.now() - dernier < reculMs) {
      // Vues encore trop fraîches — on requalifiera au prochain minuit.
      out.enAttente += 1;
      continue;
    }
    if (e.moyenne_vues === null || e.moyenne_vues === undefined) {
      // Aucune vue relevée (scrape en échec) — surtout ne pas dégrader en D
      // sur une mesure absente.
      out.enAttente += 1;
      continue;
    }
    mursOk.push(e);
  }
  if (mursOk.length === 0) return out;

  const ids = mursOk.map((e) => e.contenu_id);
  const { data: titres } = await supabase
    .from("contenus")
    .select("id, titre")
    .in("id", ids);
  const titreParId = new Map(
    (titres ?? []).map((c) => [c.id as string, (c.titre as string) ?? ""]),
  );

  for (const e of mursOk) {
    if (!estTier(e.tier)) continue;
    const moyenne = Number(e.moyenne_vues ?? 0);
    const maxVues = Number(e.max_vues ?? 0);
    const verdict = requalifier({
      tier: e.tier,
      moyenne,
      maxVues,
      nb150k: e.nb_150k ?? 0,
    });
    const passages = passagesPourTier(verdict.tier);
    const cycle = e.tier_cycle + 1;
    // Rester / arriver en S+ redébloque 3 remix, envoyés en A-tier.
    const remix = verdict.tier === "S+" ? reglages.remixParRequalif : 0;

    const detail: RequalifDetail = {
      contenuId: e.contenu_id,
      titre: titreParId.get(e.contenu_id) ?? "",
      avant: e.tier,
      apres: verdict.tier,
      moyenne,
      maxVues,
      passages,
      regle: verdict.regle,
      remix,
    };

    if (!dryRun) {
      const { error: errU } = await supabase
        .from("contenus")
        .update({
          tier: verdict.tier,
          passages_prevus: passages,
          tier_cycle: cycle,
          tier_maj_at: new Date().toISOString(),
          tier_rapport: {
            avant: e.tier,
            apres: verdict.tier,
            regle: verdict.regle,
            m: Math.round(moyenne),
            max_vues: maxVues,
            nb_150k: e.nb_150k ?? 0,
            passages_mesures: e.publies,
            cycle,
          },
        })
        .eq("id", e.contenu_id)
        // Garde-fou concurrence : personne d'autre n'a fait tourner le cycle.
        .eq("tier_cycle", e.tier_cycle);
      if (errU) throw errU;

      if (remix > 0) {
        // Un seul déblocage par cycle (contrainte unique) — rejouer minuit
        // ne multiplie pas les remix.
        const { error: errR } = await supabase.from("remix_debloques").insert({
          contenu_id: e.contenu_id,
          tier_cycle: cycle,
          nb: remix,
          tier_cible: "A",
        });
        if (errR && !`${errR.message}`.includes("duplicate")) throw errR;
      }
    }

    out.requalifies += 1;
    out.remixDebloques += remix;
    out.details.push(detail);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Rappel J+7 des passages qui percent (> 50k vues)
// ---------------------------------------------------------------------------

export interface RappelDetail {
  passageSourceId: string;
  compteId: string;
  contenuId: string;
  vues: number;
  jour: string;
  rang: number;
}

export interface RappelsResultat {
  candidats: number;
  programmes: number;
  details: RappelDetail[];
  erreurs: string[];
}

/**
 * Repère les passages publiés au-delà de `rappelVues` et reprogramme le MÊME
 * contenu sur le MÊME compte à J+7.
 *
 * Ce rappel est hors système : il ne consomme pas de passage prévu, ne compte
 * pas dans `m`, et s'ajoute au quota du compte ce jour-là. Un rappel qui perce
 * à son tour en redéclenche un, jusqu'à `rappelMax` d'affilée.
 *
 * `creerRappel` fait le pont avec l'assignation (création passage + post) —
 * injecté pour éviter une dépendance circulaire avec `assignation_contenu.ts`.
 */
export async function programmerRappels(
  supabase: Supabase,
  creerRappel: (args: {
    passageSource: {
      id: string;
      contenu_id: string;
      compte_id: string;
      langue: string;
      slides: unknown;
      musique_url: string | null;
      musique_titre: string | null;
      musique_plateforme: string | null;
      hashtags: string | null;
      rappel_rang: number;
      tier_cycle: number;
    };
    jour: string;
  }) => Promise<void>,
  opts: { dryRun?: boolean } = {},
): Promise<RappelsResultat> {
  const reglages = await chargerTierlistReglages(supabase);
  const out: RappelsResultat = {
    candidats: 0,
    programmes: 0,
    details: [],
    erreurs: [],
  };

  // Borné à un mois : au-delà, reprogrammer un J+7 n'a plus de sens, et ça
  // évite de rescanner tout l'historique des passages à chaque minuit.
  const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: perces, error } = await supabase
    .from("passages")
    .select(
      "id, contenu_id, compte_id, langue, vues, publie_at, date_publication_prevue, slides, musique_url, musique_titre, musique_plateforme, hashtags, rappel_rang, tier_cycle",
    )
    .eq("statut", "publie")
    .gte("vues", reglages.rappelVues)
    .lt("rappel_rang", reglages.rappelMax)
    .gte("date_publication_prevue", depuis);
  if (error) throw error;
  if (!perces || perces.length === 0) return out;

  // Un seul rappel par passage source — idempotent si minuit rejoue.
  const { data: existants } = await supabase
    .from("passages")
    .select("rappel_source_id")
    .in("rappel_source_id", perces.map((p) => p.id as string));
  const dejaRappeles = new Set(
    (existants ?? []).map((r) => r.rappel_source_id as string),
  );

  const candidats = perces.filter((p) => !dejaRappeles.has(p.id as string));
  out.candidats = candidats.length;

  for (const p of candidats) {
    const base = (p.publie_at as string | null) ??
      ((p.date_publication_prevue as string | null)
        ? `${p.date_publication_prevue}T00:00:00Z`
        : null);
    if (!base) continue;
    const cible = new Date(Date.parse(base) + reglages.rappelJours * 86_400_000);
    const demain = new Date(Date.now() + 86_400_000);
    // Fenêtre déjà passée (stats relevées tard) : on rattrape dès demain.
    const jour = (cible.getTime() < demain.getTime() ? demain : cible)
      .toISOString()
      .slice(0, 10);

    if (opts.dryRun) {
      out.programmes += 1;
      out.details.push({
        passageSourceId: p.id as string,
        compteId: p.compte_id as string,
        contenuId: p.contenu_id as string,
        vues: Number(p.vues ?? 0),
        jour,
        rang: Number(p.rappel_rang ?? 0) + 1,
      });
      continue;
    }

    try {
      await creerRappel({
        passageSource: {
          id: p.id as string,
          contenu_id: p.contenu_id as string,
          compte_id: p.compte_id as string,
          langue: (p.langue as string) ?? "fr",
          slides: p.slides,
          musique_url: (p.musique_url as string | null) ?? null,
          musique_titre: (p.musique_titre as string | null) ?? null,
          musique_plateforme: (p.musique_plateforme as string | null) ?? null,
          hashtags: (p.hashtags as string | null) ?? null,
          rappel_rang: Number(p.rappel_rang ?? 0),
          tier_cycle: Number(p.tier_cycle ?? 0),
        },
        jour,
      });
      out.programmes += 1;
      out.details.push({
        passageSourceId: p.id as string,
        compteId: p.compte_id as string,
        contenuId: p.contenu_id as string,
        vues: Number(p.vues ?? 0),
        jour,
        rang: Number(p.rappel_rang ?? 0) + 1,
      });
    } catch (e) {
      out.erreurs.push(
        `passage ${String(p.id).slice(0, 8)} : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return out;
}
