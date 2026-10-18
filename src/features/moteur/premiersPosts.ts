/**
 * Quand arrivent les premiers posts d'un poster (hors cohorte Ruul, qui a ses
 * propres dates : `onboarding/datesRuul.ts`).
 *
 * Depuis 0301, le warm-up dure jusqu'au lundi qui suit le clic sur « Start
 * warmup », 00:00 heure de Paris, et les premiers posts arrivent ce lundi-là.
 * Les warm-up lancés avant (minuteur 24 h) finissent n'importe quand : les
 * posts sont attribués la nuit (minuit Paris, puis rattrapage à 04:00 UTC).
 */
import { ajouterJours, partiesParis } from "@/features/onboarding/datesRuul";

/** Le lundi (AAAA-MM-JJ) qui suit le jour de `instant` à Paris : un lundi donne le lundi d'après. */
export function lundiApres(instant: Date): string {
  const jour = partiesParis(instant).date;
  // getUTCDay : dimanche 0 … samedi 6 → isodow lundi 1 … dimanche 7.
  const isodow = ((new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return ajouterJours(jour, 8 - isodow);
}

/**
 * Jour des premiers posts. Les posts d'un jour sont attribués à minuit (Paris),
 * puis rattrapés à 04:00 UTC (cron `minuit-vnext-rattrapage`) : un warm-up fini
 * avant ce rattrapage reçoit ses posts le jour même (Julieta, fin à 01:11 →
 * posts le matin même, pas le lendemain), sinon le lendemain.
 */
export function premierJourPosts(warmupEndsAt: string): string {
  const fin = partiesParis(new Date(warmupEndsAt));
  const rattrapage = Date.parse(`${fin.date}T04:00:00Z`);
  return Date.parse(warmupEndsAt) <= rattrapage ? fin.date : ajouterJours(fin.date, 1);
}

export interface CalendrierWarmup {
  /** Du jour du clic à la veille des premiers posts. */
  joursWarmup: Set<string>;
  premiersPosts: string;
}

/**
 * Cases du calendrier pendant le warm-up : les jours couverts, puis la case
 * « FIRST POSTS ». Plus rien une fois ce jour passé : les posts prennent la place.
 */
export function calendrierWarmup(opts: {
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
  maintenant?: Date;
}): CalendrierWarmup | null {
  if (!opts.warmupStartedAt || !opts.warmupEndsAt) return null;
  const premiersPosts = premierJourPosts(opts.warmupEndsAt);
  if (partiesParis(opts.maintenant ?? new Date()).date > premiersPosts) return null;
  const joursWarmup = new Set<string>();
  for (
    let jour = partiesParis(new Date(opts.warmupStartedAt)).date;
    jour < premiersPosts;
    jour = ajouterJours(jour, 1)
  ) {
    joursWarmup.add(jour);
  }
  return { joursWarmup, premiersPosts };
}
