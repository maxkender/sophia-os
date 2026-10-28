/**
 * La première semaine du posteur en 5 étapes (chantier du 28 oct., partie G),
 * hors React : la date du 1er post et l'état de chaque étape. Même ordre dans
 * l'onboarding (écran « compte ») et sur l'accueil :
 *   1) Log in · 2) Join Slack (recommandé) · 3) Create your TikTok account
 *   @handle · 4) Start warmup + follow 5 accounts, before Sunday midnight ·
 *   5) Your first post: Monday {date}, avec la règle du lien.
 */
import { lundiApres, premierJourPosts } from "@/features/moteur/premiersPosts";

import { ajouterJours, type EtatEtape } from "./datesRuul";

export const CINQ_ETAPES = ["connexion", "slack", "tiktok", "warmup", "post"] as const;
export type CleEtape = (typeof CINQ_ETAPES)[number];

/** Slack est recommandé, pas obligatoire : pas encore rejoint = « recommande ». */
export type EtatCinq = EtatEtape | "recommande";

/**
 * Le lundi du 1er post. Warm-up lancé : le jour qui suit sa fin (ce que
 * l'OS programme vraiment). Sinon le lundi de sa cohorte s'il n'est pas
 * passé, sinon le lundi qui suit aujourd'hui (celui qu'un clic donnerait).
 */
export function premierPostLe(o: {
  warmupEndsAt: string | null;
  cohorteLundi: string | null;
  maintenant: Date;
  aujourdhui: string;
}): string {
  if (o.warmupEndsAt) return premierJourPosts(o.warmupEndsAt);
  const prochain = lundiApres(o.maintenant);
  if (o.cohorteLundi && o.cohorteLundi > o.aujourdhui) return o.cohorteLundi;
  return prochain;
}

/** Le dimanche avant le 1er post : la limite du warm-up (« before Sunday midnight »). */
export function dimancheAvant(lundi: string): string {
  return ajouterJours(lundi, -1);
}

/** La carte s'efface une fois la 1re semaine de posts finie. */
export function premiereSemaineFinie(premierPost: string, aujourdhui: string): boolean {
  return aujourdhui > ajouterJours(premierPost, 6);
}

/**
 * L'état des 5 étapes. Le posteur ne coche pas « TikTok créé » : le clic sur
 * « Start warmup » vaut pour les deux (on crée le compte avant de le lancer).
 */
export function etatsCinqEtapes(o: {
  slackLie: boolean;
  warmupStartedAt: string | null;
  premierPost: string;
  aujourdhui: string;
}): Record<CleEtape, EtatCinq> {
  const lance = Boolean(o.warmupStartedAt);
  const postsCommences = o.aujourdhui >= o.premierPost;
  return {
    connexion: "fait",
    slack: o.slackLie ? "fait" : "recommande",
    tiktok: lance ? "fait" : "en_cours",
    warmup: lance ? (postsCommences ? "fait" : "en_cours") : "a_venir",
    post: postsCommences ? "en_cours" : "a_venir",
  };
}

/** « Monday 2 November » : les dates aux posteurs sont en anglais. */
export function jourAnglais(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
