import { PLAFOND_LIGNES, lireParLots, lireTout } from "./lots.ts";
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
// Quand requalifier — et quoi faire faute de mesure
// ---------------------------------------------------------------------------

/** Ce qui retient une requalification qui ne part pas. */
export type MotifAttente =
  /** Le cycle n'a pas fini ses passages (ou le contenu dort en D). */
  | "passages"
  /** Dernier passage trop frais — les vues n'ont pas fini de monter. */
  | "recul"
  /** Cycle fini, une mesure peut encore tomber, délai plafond pas atteint. */
  | "mesure";

/** Pourquoi un cycle repart sans note de performance. */
export type MotifSansMesure =
  /** Plus aucune mesure n'arrivera — les posts sont introuvables. */
  | "introuvable"
  /** Le délai plafond est passé, on ne l'attend plus. */
  | "delai";

export type DecisionRequalif =
  | { requalifier: false; motif: MotifAttente }
  | { requalifier: true; surMesure: true }
  | { requalifier: true; surMesure: false; motif: MotifSansMesure };

export interface DecisionRequalifEntree {
  /** Passages publiés du cycle courant (hors rappels J+7). */
  publies: number;
  passagesPrevus: number;
  /** Publiés portant une mesure de vues — informatif, `moyenne` décide. */
  mesures: number;
  /** Publiés dont le post ne sera jamais retrouvé (`introuvable`). */
  introuvables: number;
  /** Publiés dont la mesure peut encore tomber. */
  enAttenteMesure: number;
  /** `m` — null tant qu'aucun passage n'est mesuré. */
  moyenne: number | null;
  /** Dernier passage publié du cycle, ms epoch ; `NaN` si la date manque. */
  dernierPublieMs: number;
  maintenantMs: number;
  /** Recul minimum sur le dernier passage avant de juger. */
  reculJours: number;
  /** Plafond d'attente d'une mesure avant relance au même rang. */
  requalifMaxJours: number;
}

const JOUR_MS = 86_400_000;

/**
 * Décide si un cycle se requalifie maintenant, et sur quelle base.
 *
 * L'invariant : **un cycle terminé finit toujours par repartir**. Avant, un
 * slideshow qui avait fait tous ses passages sans qu'aucune vue soit relevée
 * restait bloqué pour de bon — `restants = 0` le sortait du pool, l'absence de
 * `m` empêchait la requalification de le relancer. Personne ne le voyait.
 *
 * Deux portes de sortie sans mesure, dans cet ordre :
 *
 *   1. **plus rien à attendre** — tous les passages publiés sont `introuvable`
 *      (la résolution a rendu les armes, cf. docs/resolution-publication.md) :
 *      aucune mesure ne viendra, inutile de patienter ;
 *   2. **délai plafond** — `requalifMaxJours` depuis le dernier passage : filet
 *      pour une résolution coincée ou un relevé de vues en panne.
 *
 * Dans les deux cas le cycle repart au **même rang** : pas de dégradation sur
 * une mesure absente, pas de promotion non méritée.
 */
export function deciderRequalif(e: DecisionRequalifEntree): DecisionRequalif {
  // Un contenu en D (0 passage) dort : il n'est pas dans un cycle.
  if (e.passagesPrevus <= 0) return { requalifier: false, motif: "passages" };
  if (e.publies < e.passagesPrevus) return { requalifier: false, motif: "passages" };

  // Vues encore trop fraîches — on requalifiera au prochain minuit.
  const age = e.maintenantMs - e.dernierPublieMs;
  const date = Number.isFinite(e.dernierPublieMs);
  if (date && age < e.reculJours * JOUR_MS) return { requalifier: false, motif: "recul" };

  // Au moins une mesure : le barème s'applique, sur ce qui est mesuré. `m` non
  // nul vaut `mesures > 0` par construction de la vue — on s'aligne sur `m`,
  // c'est lui que le barème consomme.
  if (e.moyenne !== null) return { requalifier: true, surMesure: true };

  if (e.enAttenteMesure <= 0 && e.introuvables > 0) {
    return { requalifier: true, surMesure: false, motif: "introuvable" };
  }

  // Une date de publication absente ne doit pas geler le cycle : échue d'office.
  if (!date || age >= e.requalifMaxJours * JOUR_MS) {
    return { requalifier: true, surMesure: false, motif: "delai" };
  }

  return { requalifier: false, motif: "mesure" };
}

/** Colonnes de `contenu_tier_etat` dont dépend la décision. */
export interface EtatCycle {
  passages_prevus: number;
  publies: number;
  mesures: number;
  introuvables: number;
  en_attente_mesure: number;
  moyenne_vues: number | null;
  dernier_publie_at: string | null;
}

/**
 * Même décision, depuis une ligne de `contenu_tier_etat` — l'admin affiche
 * ainsi exactement ce que minuit fera, sans le faire tourner.
 */
export function decisionDepuisEtat(
  etat: EtatCycle,
  reglages: { recul_jours: number; requalif_max_jours: number },
  maintenant: Date = new Date(),
): DecisionRequalif {
  return deciderRequalif({
    publies: etat.publies ?? 0,
    passagesPrevus: etat.passages_prevus ?? 0,
    mesures: etat.mesures ?? 0,
    introuvables: etat.introuvables ?? 0,
    enAttenteMesure: etat.en_attente_mesure ?? 0,
    moyenne: etat.moyenne_vues ?? null,
    dernierPublieMs: etat.dernier_publie_at
      ? Date.parse(etat.dernier_publie_at)
      : Number.NaN,
    maintenantMs: maintenant.getTime(),
    reculJours: reglages.recul_jours,
    requalifMaxJours: reglages.requalif_max_jours,
  });
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
  /** Jours d'attente d'une mesure avant de relancer le cycle au même rang. */
  requalifMaxJours: number;
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
    requalifMaxJours: v.requalif_max_jours ?? 3,
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
  /** Publiés portant une mesure de vues. */
  mesures: number;
  /** Publiés dont le post ne sera jamais retrouvé. */
  introuvables: number;
  /** Publiés dont la mesure peut encore tomber. */
  en_attente_mesure: number;
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
  /** Relancé faute de mesure — `avant` et `apres` sont alors identiques. */
  sansMesure?: MotifSansMesure;
}

/** Cycle terminé qui attend encore une mesure — remonté pour l'admin. */
export interface AttenteMesureDetail {
  contenuId: string;
  titre: string;
  tier: Tier;
  publies: number;
  introuvables: number;
  enAttenteMesure: number;
  dernierPublieAt: string | null;
}

/* -------------------------------------------------------------------------
 * Contrôle de complétude de la lecture.
 *
 * La pagination keyset de `lireTout` rend déjà la lecture complète par
 * construction. Ce contrôle ne la remplace pas : il sert de TÉMOIN. La panne
 * qu'on répare a vécu des semaines parce qu'une lecture amputée n'a aucune
 * signature — pas d'erreur, pas de log, un compteur `examines` qui a l'air
 * plein. On se donne donc un chiffre à confronter au nôtre, et on l'écrit dans
 * le JSON de run pour qu'il soit lisible sans rejouer quoi que ce soit.
 * ---------------------------------------------------------------------- */

export interface CoherenceLecture {
  /** Lignes réellement lues, donc réellement soumises à `deciderRequalif`. */
  lues: number;
  /**
   * `count(*)` de la vue, pris AVANT la lecture. `null` quand le comptage n'a
   * pas eu lieu (lecture ciblée) ou a échoué : on ne sait alors rien, ce qui
   * n'est pas la même chose que de savoir que tout va bien.
   */
  attendues: number | null;
  /** Faux dès qu'un écart est CONSTATÉ. Vrai aussi quand rien n'est vérifiable. */
  ok: boolean;
  /** Phrase pour le JSON de run et l'admin. `null` seulement si tout concorde. */
  alerte: string | null;
}

/**
 * Confronte le nombre de lignes lues au `count(*)` de la vue.
 *
 * Pure, donc testable sans réseau — c'est le seul moyen d'avoir ce garde-fou
 * couvert par les tests, la lecture elle-même ne l'étant pas.
 *
 * Le cas qui compte est `lues < attendues` : c'est la signature d'une
 * troncature. Quand en plus le nombre lu est un multiple exact du plafond
 * `max-rows`, le diagnostic n'est plus une hypothèse — 1000, 2000, 3000 lignes
 * pile ne sont pas des volumétries, ce sont des plafonds, et c'est très
 * exactement ce que la prod affichait (« 1000 examinés » sur 2521).
 *
 * `lues > attendues` reste un écart, mais bénin et attendu : entre le comptage
 * et la fin de la pagination, un passage a pu être publié et faire entrer un
 * cycle de plus. On le dit sans dramatiser.
 */
export function verifierCoherenceLecture(
  lues: number,
  attendues: number | null,
  motifNonVerifie?: string,
): CoherenceLecture {
  if (attendues === null) {
    return {
      lues,
      attendues: null,
      ok: true,
      alerte: `Complétude non vérifiée (${motifNonVerifie ?? "comptage indisponible"}).`,
    };
  }
  if (lues === attendues) return { lues, attendues, ok: true, alerte: null };

  if (lues < attendues) {
    const plafond = lues > 0 && lues % PLAFOND_LIGNES === 0
      ? ` ${lues} est un multiple exact du plafond max-rows (${PLAFOND_LIGNES}) : la réponse a été rognée par PostgREST, pas par la donnée.`
      : "";
    return {
      lues,
      attendues,
      ok: false,
      alerte:
        `Lecture INCOMPLÈTE de contenu_a_requalifier : ${lues} ligne(s) lue(s) pour ${attendues} annoncée(s).` +
        plafond +
        ` ${attendues - lues} cycle(s) terminé(s) n'ont pas été examinés ce run.`,
    };
  }

  return {
    lues,
    attendues,
    ok: false,
    alerte:
      `Lecture de contenu_a_requalifier plus longue que le comptage : ${lues} ligne(s) pour ` +
      `${attendues} annoncée(s). Sans gravité — des cycles se sont terminés pendant la lecture —, ` +
      `mais l'écart est noté plutôt que tu.`,
  };
}

export interface RequalificationResultat {
  /**
   * Lignes lues dans `contenu_a_requalifier`, donc cycles TERMINÉS examinés.
   *
   * Changement de sémantique assumé : le compteur couvrait auparavant tous les
   * cycles vivants (`passages_prevus > 0`), y compris ceux qui n'avaient pas
   * fini leurs passages. Il valait donc 1000 — la taille de la fenêtre lue, pas
   * celle de la population. Il vaut désormais ce que la requalification a
   * vraiment eu sous les yeux, et `coherence` dit s'il est complet.
   */
  examines: number;
  requalifies: number;
  /**
   * Examinés non requalifiés. Ne couvre plus les cycles non terminés, que la
   * vue écarte en amont : un contenu qui n'a pas fini ses passages n'était de
   * toute façon « en attente » que par abus de langage.
   */
  enAttente: number;
  /** Parmi les requalifiés : ceux relancés au même rang, sans mesure. */
  sansMesure: number;
  remixDebloques: number;
  details: RequalifDetail[];
  /**
   * Cycles finis encore en attente d'une mesure, sous le délai plafond. Le
   * comptage `enAttente` mélange tout ; ceux-là sont les seuls à risque.
   */
  attentesMesure: AttenteMesureDetail[];
  /** Témoin de complétude de la lecture — voir `verifierCoherenceLecture`. */
  coherence: CoherenceLecture;
}

/* -------------------------------------------------------------------------
 * Trace du run dans `reglages.minuit_dernier_run`.
 *
 * C'est la couche qui manquait le plus. La requalification ne laissait aucune
 * trace nulle part : `out.tierlist` ne vivait que dans la réponse HTTP de
 * minuit-vnext — or pour le cron, c'est pg_cron/net.http_post qui la reçoit et
 * la jette. Aucun compteur n'était persisté, donc personne ne pouvait voir que
 * « examines » collait au plafond depuis des semaines. La panne n'a pas duré
 * parce qu'elle était subtile, elle a duré parce qu'elle était invisible.
 * ---------------------------------------------------------------------- */

/** Bloc `tierlist` du JSON `reglages.minuit_dernier_run`. */
export interface RunTierlist {
  at: string;
  /** Cycles terminés examinés (voir `RequalificationResultat.examines`). */
  examines: number;
  requalifies: number;
  enAttente: number;
  sansMesure: number;
  /** `count(*)` de la vue au moment de la lecture. `null` = non vérifié. */
  attendues: number | null;
  /** Faux = écart constaté entre le comptage et la lecture. */
  complet: boolean;
  alerte: string | null;
}

export function blocRunTierlist(
  res: RequalificationResultat,
  maintenant: Date = new Date(),
): RunTierlist {
  return {
    at: maintenant.toISOString(),
    examines: res.examines,
    requalifies: res.requalifies,
    enAttente: res.enAttente,
    sansMesure: res.sansMesure,
    attendues: res.coherence.attendues,
    complet: res.coherence.ok,
    alerte: res.coherence.alerte,
  };
}

/**
 * Reporte le bloc `tierlist` d'une valeur `minuit_dernier_run` précédente.
 *
 * À étaler (`...`) dans TOUT littéral qui reconstruit cette valeur — et il y en
 * a trois : les deux upserts de minuit-vnext et `fusionnerDernierRun` du drain
 * d'assignation. Ces littéraux rebâtissent l'objet de zéro, donc toute clé non
 * recopiée est DÉTRUITE. Comme minuit lance la tierlist puis kicke le drain, le
 * premier lot d'assignation effacerait le bloc quelques secondes après son
 * écriture : le compteur qu'on ajoute pour rendre l'étape visible disparaîtrait
 * avant d'avoir été lu une seule fois.
 *
 * Rien à reporter d'un autre jour : `minuit_dernier_run` décrit le run du jour,
 * et un bloc de la veille mentirait plus qu'il n'informerait.
 */
export function reporterBlocTierlist(
  ancien: unknown,
  memeJour: boolean,
): { tierlist?: RunTierlist } {
  if (!memeJour || !ancien || typeof ancien !== "object") return {};
  const bloc = (ancien as { tierlist?: unknown }).tierlist;
  if (!bloc || typeof bloc !== "object") return {};
  return { tierlist: bloc as RunTierlist };
}

/**
 * Colonnes dont dépend la décision.
 *
 * Une seule chaîne pour les deux sources : `contenu_a_requalifier` reprend les
 * colonnes de `contenu_tier_etat` sous les mêmes noms et dans le même ordre
 * (migration 0253), précisément pour que cette chaîne n'ait pas à se dédoubler.
 * Si elles divergeaient un jour, ce point unique le ferait apparaître tout de
 * suite au lieu de laisser deux `select` se désynchroniser en silence.
 */
const COLONNES_ETAT =
  "contenu_id, tier, passages_prevus, tier_cycle, publies, en_vol, restants, moyenne_vues, max_vues, nb_150k, mesures, introuvables, en_attente_mesure, dernier_publie_at";

interface LectureEtats {
  etats: TierEtat[];
  coherence: CoherenceLecture;
}

/**
 * Compte les cycles terminés, AVANT de les lire.
 *
 * Avant et pas après, et c'est structurant : les UPDATE de requalification
 * font SORTIR de la vue les contenus qu'on vient de relancer (leur nouveau
 * cycle repart à 0 publié, donc `publies >= passages_prevus` retombe faux). Un
 * comptage pris à la fin du run mesurerait un autre ensemble et ne prouverait
 * rien du tout.
 *
 * `head: true` : on veut un nombre, pas des lignes. Un second `select` complet
 * rejouerait exactement la lecture qu'on cherche à contrôler — et se ferait
 * tronquer de la même façon, donc concorderait avec elle sans rien démontrer.
 *
 * L'échec du comptage ne lève pas. C'est un témoin, pas une dépendance : la
 * lecture, elle, est déjà complète par construction (`lireTout`). Faire tomber
 * la requalification parce que son thermomètre est cassé serait exactement le
 * travers inverse de celui qu'on répare.
 */
async function compterCyclesTermines(supabase: Supabase): Promise<number | null> {
  const { count, error } = await supabase
    .from("contenu_a_requalifier")
    .select("contenu_id", { count: "exact", head: true });
  if (error || typeof count !== "number") return null;
  return count;
}

/**
 * Lecture du run complet : tous les cycles terminés, par pagination keyset.
 *
 * La vue `contenu_a_requalifier` fait le dégrossissage (202 lignes au lieu de
 * 2521) et `lireTout` supprime l'hypothèse : la vue réduit le volume, elle ne
 * garantit pas qu'il restera sous `max-rows` demain. Les deux ensemble, et pas
 * l'un ou l'autre.
 *
 * Ancre `contenu_id` : unique sur la vue, qui rend une ligne par contenu. C'est
 * la condition de la pagination keyset — sur `contenu_labels`, où `contenu_id`
 * n'est pas unique, il faudrait le couple (voir `OptionsLireTout.ancre`).
 *
 * Pas de `.gt("passages_prevus", 0)` ici : le filtre est DANS la vue. Le
 * redoubler laisserait croire que la vue ne suffit pas et inviterait, le jour
 * où l'un des deux bougerait, à se demander lequel fait foi.
 */
async function lireCyclesTermines(supabase: Supabase): Promise<LectureEtats> {
  const attendues = await compterCyclesTermines(supabase);

  const etats = await lireTout<TierEtat>(
    "Requalification — cycles terminés",
    async (curseur, taille) => {
      let q = supabase
        .from("contenu_a_requalifier")
        .select(COLONNES_ETAT)
        .order("contenu_id", { ascending: true })
        .limit(taille);
      if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
      const { data, error } = await q;
      return { data: (data ?? null) as TierEtat[] | null, error };
    },
    { ancre: (e) => e.contenu_id },
  );

  return { etats, coherence: verifierCoherenceLecture(etats.length, attendues) };
}

/**
 * Lecture ciblée — bouton admin « requalifier ce contenu ».
 *
 * Elle vise `contenu_tier_etat` et surtout PAS la vue de dégrossissage, à
 * dessein. Un contenu dont le cycle n'est pas terminé ne figure pas dans
 * `contenu_a_requalifier` : lu là, il rendrait zéro ligne et l'admin lirait
 * « 0 examiné », c'est-à-dire un contenu devenu introuvable d'un clic. Sur la
 * source complète il est examiné normalement, `deciderRequalif` rend l'attente
 * « passages », et l'admin retrouve le verdict que `decisionDepuisEtat` lui
 * affiche déjà sur la page Slideshows. Un clic ne doit jamais répondre « rien »
 * quand la bonne réponse est « pas encore ».
 *
 * Une ligne, donc ni pagination ni témoin de complétude : `maybeSingle()` ne
 * peut pas être tronqué par `max-rows`.
 */
async function lireUnContenu(supabase: Supabase, contenuId: string): Promise<LectureEtats> {
  const { data, error } = await supabase
    .from("contenu_tier_etat")
    .select(COLONNES_ETAT)
    .eq("contenu_id", contenuId)
    .maybeSingle();
  if (error) throw error;
  return {
    etats: data ? [data as TierEtat] : [],
    coherence: verifierCoherenceLecture(
      data ? 1 : 0,
      null,
      "lecture ciblée d'un seul contenu, sans objet",
    ),
  };
}

/**
 * Requalifie tous les contenus dont le cycle est terminé.
 *
 * Un cycle est terminé quand tous les passages prévus sont **publiés** (un
 * passage assigné mais jamais publié n'est pas consommé — il revient au pool)
 * et que le dernier publié a pris `reculJours` jour(s), le temps que les vues
 * remontent.
 *
 * Faute de mesure, le cycle repart quand même au même rang — dès que plus
 * aucune vue ne peut tomber, ou au bout de `requalifMaxJours`. Voir
 * `deciderRequalif` : un cycle terminé ne doit jamais rester bloqué.
 *
 * LECTURE : la source est la vue `contenu_a_requalifier` (migration 0253), lue
 * page par page. Elle ne garde que les cycles terminés — les deux premières
 * gardes de `deciderRequalif`, et rien d'autre : la décision et le barème
 * restent ici, en TypeScript, pour que minuit et la page Slideshows de l'admin
 * ne puissent pas trancher différemment.
 *
 * Avant ce changement, la requête lisait `contenu_tier_etat` d'un bloc : 2521
 * lignes matchées, 1000 rendues par PostgREST, en 200. ~1500 contenus n'étaient
 * jamais examinés, et `examines` affichait 1000 avec l'air d'un inventaire
 * complet. Le mécanisme s'auto-entretenait : sous MVCC une ligne requalifiée
 * est réécrite en fin de tas, donc les contenus actifs sortaient d'eux-mêmes de
 * la fenêtre lue.
 */
export async function requalifierContenus(
  supabase: Supabase,
  opts: { dryRun?: boolean; contenuId?: string | null } = {},
): Promise<RequalificationResultat> {
  const reglages = await chargerTierlistReglages(supabase);
  const dryRun = Boolean(opts.dryRun);

  // Deux sources, un seul traitement derrière. Le run complet passe par la vue
  // de dégrossissage + pagination ; le clic admin sur UN contenu reste sur la
  // source non filtrée, faute de quoi un cycle non terminé disparaîtrait au
  // lieu d'afficher son attente (voir `lireUnContenu`).
  const { etats, coherence } = opts.contenuId
    ? await lireUnContenu(supabase, opts.contenuId)
    : await lireCyclesTermines(supabase);

  const out: RequalificationResultat = {
    examines: etats.length,
    requalifies: 0,
    enAttente: 0,
    sansMesure: 0,
    remixDebloques: 0,
    details: [],
    attentesMesure: [],
    coherence,
  };

  type Mur = { etat: TierEtat; decision: Extract<DecisionRequalif, { requalifier: true }> };
  const mursOk: Mur[] = [];
  const attentes: TierEtat[] = [];
  const maintenantMs = Date.now();
  for (const e of etats) {
    const decision = deciderRequalif({
      publies: e.publies,
      passagesPrevus: e.passages_prevus,
      mesures: e.mesures ?? 0,
      introuvables: e.introuvables ?? 0,
      enAttenteMesure: e.en_attente_mesure ?? 0,
      moyenne: e.moyenne_vues ?? null,
      dernierPublieMs: e.dernier_publie_at ? Date.parse(e.dernier_publie_at) : Number.NaN,
      maintenantMs,
      reculJours: reglages.reculJours,
      requalifMaxJours: reglages.requalifMaxJours,
    });
    if (!decision.requalifier) {
      out.enAttente += 1;
      // Cycle fini qui attend une mesure : le seul cas qui peut traîner, donc
      // le seul qu'on remonte nommément.
      if (decision.motif === "mesure") attentes.push(e);
      continue;
    }
    mursOk.push({ etat: e, decision });
  }
  if (mursOk.length === 0 && attentes.length === 0) return out;

  const ids = [
    ...mursOk.map((m) => m.etat.contenu_id),
    ...attentes.map((e) => e.contenu_id),
  ];
  // Découpé, et l'erreur remontée. Deux raisons, dans cet ordre.
  // 1) `ids` n'était borné que par la troncature : la fenêtre de 1000 lignes
  //    tenait indirectement la liste sous les 400 valeurs de `verifierTailleIn`.
  //    En lisant enfin tout, un run normal (143 requalifiables + les attentes
  //    « mesure ») dépasse ce seuil et l'étape tierlist entière partirait en
  //    500. Corriger la lecture sans corriger ceci aurait troqué une famine
  //    silencieuse contre un crash — le correctif se doit d'être solidaire.
  // 2) L'erreur n'était pas relue du tout ici. L'impact restait modeste (des
  //    titres vides), mais c'est le même geste qui a coûté 41 créateurs à
  //    0 post/jour le 20/08 : une lecture ratée qui passe pour un résultat.
  const titres = await lireParLots<{ id: string; titre: string | null }>(
    ids,
    "Requalification — titres des contenus",
    (lot) => supabase.from("contenus").select("id, titre").in("id", lot),
  );
  const titreParId = new Map(titres.map((c) => [c.id, c.titre ?? ""]));

  for (const e of attentes) {
    out.attentesMesure.push({
      contenuId: e.contenu_id,
      titre: titreParId.get(e.contenu_id) ?? "",
      tier: e.tier,
      publies: e.publies,
      introuvables: e.introuvables ?? 0,
      enAttenteMesure: e.en_attente_mesure ?? 0,
      dernierPublieAt: e.dernier_publie_at,
    });
  }

  for (const { etat: e, decision } of mursOk) {
    if (!estTier(e.tier)) continue;
    const moyenne = Number(e.moyenne_vues ?? 0);
    const maxVues = Number(e.max_vues ?? 0);
    // Sans mesure, on relance au même rang : le barème n'a rien à mordre, et
    // dégrader sur une absence de données punirait un relevé en panne.
    const verdict = decision.surMesure
      ? requalifier({ tier: e.tier, moyenne, maxVues, nb150k: e.nb_150k ?? 0 })
      : {
        tier: e.tier,
        regle: decision.motif === "introuvable"
          ? `aucune mesure possible (${e.introuvables ?? 0} post(s) introuvable(s)) — cycle relancé au même rang`
          : `aucune vue relevée après ${reglages.requalifMaxJours} j — cycle relancé au même rang`,
      };
    const passages = passagesPourTier(verdict.tier);
    const cycle = e.tier_cycle + 1;
    // Rester / arriver en S+ redébloque 3 remix, envoyés en A-tier — sur une
    // vraie mesure seulement : une relance à l'aveugle n'a rien prouvé.
    const remix = decision.surMesure && verdict.tier === "S+"
      ? reglages.remixParRequalif
      : 0;

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
      ...(decision.surMesure ? {} : { sansMesure: decision.motif }),
    };

    // `m` / `max_vues` restent absents d'une relance sans mesure : écrire 0
    // laisserait croire à un cycle mesuré à zéro vue.
    const rapport: Record<string, unknown> = {
      avant: e.tier,
      apres: verdict.tier,
      regle: verdict.regle,
      nb_150k: e.nb_150k ?? 0,
      passages_mesures: e.publies,
      cycle,
    };
    if (decision.surMesure) {
      rapport.m = Math.round(moyenne);
      rapport.max_vues = maxVues;
    } else {
      rapport.sans_mesure = decision.motif;
    }

    if (!dryRun) {
      const { error: errU } = await supabase
        .from("contenus")
        .update({
          tier: verdict.tier,
          passages_prevus: passages,
          tier_cycle: cycle,
          tier_maj_at: new Date().toISOString(),
          tier_rapport: rapport,
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
    if (!decision.surMesure) out.sansMesure += 1;
    out.remixDebloques += remix;
    out.details.push(detail);
  }

  return out;
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
 * Le rappel est hors tierlist — il ne consomme pas de passage prévu et ne compte
 * pas dans `m` — mais il **prend la place** d'un post classique dans la journée
 * du compte : le quota quotidien n'est jamais dépassé, et le surplus glisse aux
 * jours suivants (voir `etalerRappels`). Un rappel qui perce à son tour en
 * redéclenche un, jusqu'à `rappelMax` d'affilée.
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
  if (candidats.length === 0) return out;

  // Le jour même est figé (posts déjà distribués) : on part de demain.
  const premierJour = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const parId = new Map(candidats.map((p) => [p.id as string, p]));
  const aPlacer: CandidatRappel[] = [];
  for (const p of candidats) {
    // Jour de publication de la source : `publie_at` fait foi, la date prévue
    // sert de repli pour un passage publié sans horodatage.
    const publieLe = ((p.publie_at as string | null) ??
      (p.date_publication_prevue as string | null) ?? "").slice(0, 10);
    if (!publieLe) continue;
    aPlacer.push({
      id: p.id as string,
      compteId: p.compte_id as string,
      publieLe,
      jourCible: new Date(
        Date.parse(`${publieLe}T00:00:00Z`) + reglages.rappelJours * 86_400_000,
      )
        .toISOString()
        .slice(0, 10),
    });
  }

  // Quota quotidien des comptes concernés — un rappel prend la place d'un post
  // classique, il ne s'y ajoute pas.
  const compteIds = [...new Set(aPlacer.map((c) => c.compteId))];
  const { data: comptes } = await supabase
    .from("comptes")
    .select("id, posts_par_jour")
    .in("id", compteIds);
  const quotas = new Map(
    (comptes ?? []).map((
      c,
    ) => [c.id as string, Math.min(3, Math.max(1, Number(c.posts_par_jour ?? 1)))]),
  );

  // Ce qui occupe déjà les jours à venir (rappels d'un run précédent compris).
  const { data: futurs } = await supabase
    .from("passages")
    .select("compte_id, date_publication_prevue, posts!inner(est_test)")
    .in("compte_id", compteIds)
    .gte("date_publication_prevue", premierJour)
    .eq("posts.est_test", false);
  const occupes = new Map<string, number>();
  for (const f of futurs ?? []) {
    const k = `${f.compte_id}@${f.date_publication_prevue}`;
    occupes.set(k, (occupes.get(k) ?? 0) + 1);
  }

  const places = etalerRappels(aPlacer, {
    premierJour,
    quota: (id) => quotas.get(id) ?? 1,
    occupation: (id, jour) => occupes.get(`${id}@${jour}`) ?? 0,
  });

  for (const place of places) {
    const p = parId.get(place.id)!;
    const jour = place.jour;
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
