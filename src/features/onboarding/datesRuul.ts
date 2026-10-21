/**
 * Dates d'un poster de la cohorte Ruul (venu du site), en heure de Paris
 * comme l'OS : lundi de démarrage, fin du warm-up, premier paiement.
 *
 * - Le warm-up lancé avant le lundi dure jusqu'au lundi 00:00 (triggers de
 *   0296 et 0301), sans minimum : lancé le dimanche, posts le lundi. Lancé
 *   après, il dure jusqu'au lundi qui suit le clic.
 * - Les posts sont attribués la nuit aux comptes sortis du warm-up : ils
 *   arrivent le matin qui suit la fin du warm-up.
 * - Premier paiement : le lundi qui suit la première semaine de posts
 *   (lundi → dimanche), comme chaque paiement ensuite.
 */

export type ConseilWarmupRuul =
  /** Pas lancé, au plus tard le dimanche d'avant le lundi : posts le lundi. */
  | { cas: "a_lancer" }
  /** Pas lancé, le lundi est passé : posts le lundi qui suit le clic. */
  | { cas: "a_lancer_en_retard" }
  /** En cours : `finAuLundi` = se termine pile au lundi 00:00 (posts ce matin-là). */
  | { cas: "en_cours"; fin: string; finAuLundi: boolean }
  | { cas: "termine" };

const PARIS = "Europe/Paris";

/** Date (AAAA-MM-JJ) et heure (HH:mm) de Paris pour un instant. */
export function partiesParis(instant: Date): { date: string; heure: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const heure = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return { date, heure };
}

/** AAAA-MM-JJ + n jours (calendrier, sans fuseau). */
export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dernier jour de la première semaine de posts (le dimanche). */
export function finPremiereSemaineRuul(debutLe: string): string {
  return ajouterJours(debutLe, 6);
}

/** Le lundi qui suit la première semaine de posts : premier paiement. */
export function premierPaiementRuul(debutLe: string): string {
  return ajouterJours(debutLe, 7);
}

export function conseilWarmupRuul(opts: {
  debutLe: string;
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
  maintenant?: Date;
}): ConseilWarmupRuul {
  const maintenant = opts.maintenant ?? new Date();
  if (opts.warmupStartedAt && opts.warmupEndsAt) {
    const fin = new Date(opts.warmupEndsAt);
    if (fin.getTime() <= maintenant.getTime()) return { cas: "termine" };
    const p = partiesParis(fin);
    return { cas: "en_cours", fin: opts.warmupEndsAt, finAuLundi: p.date === opts.debutLe && p.heure === "00:00" };
  }
  const aujourdhui = partiesParis(maintenant).date;
  if (aujourdhui >= opts.debutLe) return { cas: "a_lancer_en_retard" };
  return { cas: "a_lancer" };
}

export type EtatEtape = "fait" | "en_cours" | "a_venir";

export interface FriseRuul {
  conseil: ConseilWarmupRuul;
  /** Lancer le warm-up → warm-up → premiers posts → premier paiement. */
  etats: Record<"lancer" | "warmup" | "posts" | "paiement", EtatEtape>;
  /** Le premier paiement est passé : la frise n'a plus lieu d'être. */
  terminee: boolean;
}

/** La première semaine d'un poster de la cohorte Ruul, étape par étape. */
export function friseRuul(opts: {
  debutLe: string;
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
  maintenant?: Date;
}): FriseRuul {
  const maintenant = opts.maintenant ?? new Date();
  const conseil = conseilWarmupRuul({ ...opts, maintenant });
  const aujourdhui = partiesParis(maintenant).date;
  const paiement = premierPaiementRuul(opts.debutLe);
  const lance = conseil.cas === "en_cours" || conseil.cas === "termine";
  return {
    conseil,
    etats: {
      lancer: lance ? "fait" : "en_cours",
      warmup: conseil.cas === "termine" ? "fait" : conseil.cas === "en_cours" ? "en_cours" : "a_venir",
      posts: conseil.cas === "termine" ? (aujourdhui >= paiement ? "fait" : "en_cours") : "a_venir",
      paiement: aujourdhui > paiement ? "fait" : aujourdhui === paiement ? "en_cours" : "a_venir",
    },
    terminee: aujourdhui > paiement,
  };
}

/** « Monday 26 October » dans la langue de l'interface (date de calendrier). */
export function formaterJour(jour: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${jour}T12:00:00Z`),
  );
}

/** « Monday 26 October, 00:00 » en heure de Paris. */
export function formaterInstantParis(instant: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: PARIS,
  }).format(new Date(instant));
}
