/**
 * La première semaine du posteur en 5 étapes (chantier du 28 oct., partie G),
 * hors React : la date du 1er post et l'état de chaque étape. Même ordre dans
 * l'onboarding (écran « compte ») et sur l'accueil :
 *   1) Log in · 2) Join Slack (recommandé) · 3) Create your TikTok account
 *   @handle · 4) Start warmup + follow 5 accounts, before Sunday midnight ·
 *   5) Your first post: Monday {date}, avec la règle du lien.
 */
import { arriveePosts, fuseauPays } from "@/features/moteur/echeancePublication";
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
 * 0497 : l'étape 4 est faite dès que le dernier relevé VALIDE la voit prête
 * (≥ 5 follows, compte trouvé, aucun post : `pret` de mon_warmup) ; un relevé
 * illisible ne la défait jamais. « I did this step » (declares) : faite aussi,
 * le temps que l'équipe vérifie (l'OS a pu se tromper).
 */
export function etatsCinqEtapes(o: {
  slackLie: boolean;
  warmupStartedAt: string | null;
  premierPost: string;
  aujourdhui: string;
  pret?: boolean;
  declares?: ReadonlySet<string>;
}): Record<CleEtape, EtatCinq> {
  const declare = (cle: CleEtape) => o.declares?.has(cle) ?? false;
  const lance = Boolean(o.warmupStartedAt);
  const postsCommences = o.aujourdhui >= o.premierPost;
  const warmupFait = (lance && (o.pret || postsCommences)) || declare("warmup");
  return {
    connexion: "fait",
    slack: o.slackLie || declare("slack") ? "fait" : "recommande",
    tiktok: lance || declare("tiktok") ? "fait" : "en_cours",
    warmup: warmupFait ? "fait" : lance ? "en_cours" : "a_venir",
    post: postsCommences ? "en_cours" : "a_venir",
  };
}

/** L'abréviation lue par le posteur : JST pour le Japon (Intl ne rend que « GMT+9 »). */
const ABREVIATIONS: Readonly<Record<string, string>> = { "Asia/Tokyo": "JST", "Asia/Seoul": "KST" };

function abreviation(fuseau: string, instant: Date): string {
  if (ABREVIATIONS[fuseau]) return ABREVIATIONS[fuseau];
  const lire = (langue: string) =>
    new Intl.DateTimeFormat(langue, { timeZone: fuseau, timeZoneName: "short" })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const gb = lire("en-GB");
  if (!/^(GMT|UTC)[+-]/.test(gb)) return gb;
  const us = lire("en-US");
  return /^(GMT|UTC)[+-]/.test(us) ? gb : us;
}

/**
 * L'heure à laquelle le 1er post arrive, dans le fuseau du pays du compte :
 * minuit à Paris, soit 08:00 JST au Japon. À l'ouest de Paris, les posts sont
 * là avant le lundi : « 00:00 » (heure du posteur, sans abréviation : un pays
 * à plusieurs fuseaux n'en a pas une seule).
 */
export function heurePremierPost(premierPost: string, pays: string | null | undefined): { heure: string; fuseau: string | null } {
  const zone = fuseauPays(pays);
  const arrivee = arriveePosts(premierPost);
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(arrivee);
  const v = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  if (`${v("year")}-${v("month")}-${v("day")}` < premierPost) return { heure: "00:00", fuseau: null };
  return { heure: `${v("hour")}:${v("minute")}`, fuseau: abreviation(zone, arrivee) };
}

/** TikTok bloque les follows : 0 follow lu (compte trouvé) plus de 24 h après Start warmup. */
export function followsBloques(
  w: { existe: boolean | null; abonnements: number | null; warmup_started_at: string | null } | null | undefined,
  maintenant: Date,
): boolean {
  if (!w?.warmup_started_at || w.existe !== true || (w.abonnements ?? 0) > 0) return false;
  return maintenant.getTime() - new Date(w.warmup_started_at).getTime() > 24 * 3600_000;
}

/** « Monday 2 November » : les dates aux posteurs sont en anglais. */
export function jourAnglais(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
