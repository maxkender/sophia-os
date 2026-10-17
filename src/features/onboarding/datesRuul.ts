/**
 * Dates d'un poster de la cohorte Ruul (venu du site), en heure de Paris
 * comme l'OS : lundi de démarrage, fin du warm-up, premier paiement.
 *
 * - Le warm-up lancé avant le lundi dure jusqu'au lundi 00:00 (trigger de
 *   0296), au moins 24 h : lancé le dimanche, il déborde sur le lundi et les
 *   premiers posts glissent au mardi.
 * - Les posts sont attribués la nuit aux comptes sortis du warm-up : ils
 *   arrivent le matin qui suit la fin du warm-up.
 * - Premier paiement : le dimanche qui clôt la première semaine de posts.
 */

export type ConseilWarmupRuul =
  /** Pas lancé, au plus tard le samedi d'avant le lundi : posts le lundi. */
  | { cas: "a_lancer" }
  /** Pas lancé, on est le dimanche d'avant : posts le mardi. */
  | { cas: "a_lancer_dimanche" }
  /** Pas lancé, le lundi est passé : 24 h, puis posts le lendemain matin. */
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

/** Le dimanche qui clôt la première semaine de posts (lundi → dimanche). */
export function premierPaiementRuul(debutLe: string): string {
  return ajouterJours(debutLe, 6);
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
  if (aujourdhui === ajouterJours(opts.debutLe, -1)) return { cas: "a_lancer_dimanche" };
  return { cas: "a_lancer" };
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
