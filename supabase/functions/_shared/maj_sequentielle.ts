/**
 * Séquencement de « Mettre à jour les sources ».
 *
 * Le bouton lançait les 21 comptes d'un coup : la file serveur recevait la
 * somme de tous leurs retards (2286 posts le 19/08), et l'instance Postgres a
 * saturé jusqu'à la perte du login. On enchaîne donc un compte à la fois, en
 * attendant entre deux que la file serveur soit vide — la même condition que
 * l'historique quand il n'affiche plus ni « En file » ni « Pipeline… ».
 */

/** Ce qui reste à traiter côté serveur, tous comptes confondus. */
export interface MesureFile {
  /** Scrapes en attente ou en cours (`import_file`). */
  file: number;
  /** Pipelines en attente ou en cours (`contenus`). */
  pipeline: number;
  /**
   * Travail achevé (scrapes terminés + pipelines terminés), monotone.
   *
   * Indispensable : un scrape qui finit retire une ligne d'`import_file` et
   * crée un `contenus` en attente. Le reste-à-faire est donc CONSTANT pendant
   * toute la phase de scrape — le 19/08 il est resté pile à 239 alors que le
   * serveur abattait jusqu'à 43 scrapes/minute, et la séquence s'est crue
   * bloquée. C'est ce compteur-là qui prouve que ça avance.
   */
  faits: number;
}

export const restantFile = (m: MesureFile): number => m.file + m.pipeline;

export interface EtatAttente {
  /** Plus petit reste observé : une baisse est un progrès. */
  minRestant: number | null;
  /** Plus grand achevé observé : une hausse est un progrès aussi. */
  maxFaits: number | null;
  dernierProgresA: number;
}

export type VerdictAttente =
  | { type: "vide" }
  | { type: "attendre"; restant: number }
  /** La file stagne : enfiler un compte de plus ferait retomber la base. */
  | { type: "bloquee"; restant: number; depuisMs: number };

export function attenteInitiale(maintenant: number): EtatAttente {
  return { minRestant: null, maxFaits: null, dernierProgresA: maintenant };
}

/**
 * Un pas d'attente. On ne fixe pas de durée maximale : un gros compte met
 * légitimement des dizaines de minutes à se drainer. Le garde-fou porte sur la
 * progression — le reste qui baisse OU l'achevé qui monte.
 */
export function avancerAttente(
  etat: EtatAttente,
  mesure: MesureFile,
  maintenant: number,
  stallMs: number,
): { etat: EtatAttente; verdict: VerdictAttente } {
  const restant = restantFile(mesure);
  if (restant === 0) {
    return {
      etat: { minRestant: 0, maxFaits: mesure.faits, dernierProgresA: maintenant },
      verdict: { type: "vide" },
    };
  }
  const baisse = etat.minRestant === null || restant < etat.minRestant;
  const acheve = etat.maxFaits === null || mesure.faits > etat.maxFaits;
  const progresse = baisse || acheve;
  const suivant: EtatAttente = progresse
    ? {
        minRestant: Math.min(restant, etat.minRestant ?? restant),
        maxFaits: Math.max(mesure.faits, etat.maxFaits ?? mesure.faits),
        dernierProgresA: maintenant,
      }
    : etat;
  const depuisMs = maintenant - suivant.dernierProgresA;
  if (depuisMs >= stallMs) {
    return { etat: suivant, verdict: { type: "bloquee", restant, depuisMs } };
  }
  return { etat: suivant, verdict: { type: "attendre", restant } };
}

/** Sondage calme : une grosse file met des minutes à descendre (~6/min mesuré). */
export function delaiSondage(restant: number): number {
  return restant <= 20 ? 10_000 : 20_000;
}

/**
 * 20 min sans le moindre travail achevé = drain mort. Large exprès : le lease
 * d'un pas de pipeline est de 8 min, il faut en tolérer deux d'affilée.
 */
export const STAGNATION_MS = 20 * 60_000;

export interface MajCompte {
  id: string;
  handle: string;
  langue: string;
  /**
   * 15/11 (Adrien) : « recents » enfile les slideshows les plus récents
   * d'abord au lieu des plus vus ; `max` plafonne ce passage (sinon les
   * plafonds habituels). Posé à la main dans `maj_sources_run.comptes`.
   */
  ordre?: "vues" | "recents";
  max?: number;
}

export interface MajJournalLigne {
  at: string;
  niveau: "info" | "ok" | "warn" | "error";
  message: string;
  detail?: string;
}

/**
 * État persisté (`reglages.maj_sources_run`). Vit côté Postgres : fermer
 * l'onglet n'arrête plus la séquence.
 */
export interface MajSourcesRun {
  statut: "running" | "done" | "cancelled" | "bloquee";
  comptes: MajCompte[];
  /** Prochain compte à enfiler (0-based). */
  index: number;
  faits: number;
  handle: string | null;
  phase: "attente" | "import" | null;
  restant: number;
  minRestant: number | null;
  maxFaits: number | null;
  dernierProgresAt: number | null;
  journal: MajJournalLigne[];
}

export type DecisionTick =
  | { type: "rien" }
  | { type: "done" }
  | { type: "attendre"; restant: number; etat: EtatAttente }
  | { type: "bloquee"; restant: number; depuisMs: number }
  | { type: "enfiler"; index: number; compte: MajCompte };

/**
 * Un tick serveur. Appelé par le worker d'import quand il n'a plus rien à
 * scraper/drainer, et par le cron minute (filet si le worker est mort).
 */
export function deciderTick(
  run: MajSourcesRun,
  mesure: MesureFile,
  maintenant: number,
  stallMs: number = STAGNATION_MS,
): DecisionTick {
  if (run.statut !== "running") return { type: "rien" };
  if (run.index >= run.comptes.length) return { type: "done" };

  const attente = avancerAttente(
    {
      minRestant: run.minRestant,
      maxFaits: run.maxFaits,
      dernierProgresA: run.dernierProgresAt ?? maintenant,
    },
    mesure,
    maintenant,
    stallMs,
  );

  if (attente.verdict.type === "vide") {
    const compte = run.comptes[run.index];
    if (!compte) return { type: "done" };
    return { type: "enfiler", index: run.index, compte };
  }
  if (attente.verdict.type === "bloquee") {
    return {
      type: "bloquee",
      restant: attente.verdict.restant,
      depuisMs: attente.verdict.depuisMs,
    };
  }
  return {
    type: "attendre",
    restant: attente.verdict.restant,
    etat: attente.etat,
  };
}

/** Vue UI dérivée de l'état persisté (reprise à l'ouverture de la page). */
export function etatDepuisRun(run: MajSourcesRun | null): {
  actif: boolean;
  total: number;
  faits: number;
  handle: string | null;
  phase: "import" | "attente" | null;
  restant: number;
} {
  if (!run || run.statut !== "running") {
    return {
      actif: false,
      total: run?.comptes.length ?? 0,
      faits: run?.faits ?? 0,
      handle: null,
      phase: null,
      restant: 0,
    };
  }
  return {
    actif: true,
    total: run.comptes.length,
    faits: run.faits,
    handle: run.handle,
    phase: run.phase,
    restant: run.restant,
  };
}
