/**
 * Prompt 25 : la relance du jour des nouvelles recrues. Une seule relance par
 * recrue et par jour, avec seulement ce qui lui manque (la 1re étape pas
 * faite), sur des données sûres : la 1re connexion, Start warmup cliqué, le
 * nombre d'abonnements relevé, la fin du warm-up. Rien ici ne touche la base
 * ni le réseau.
 *
 * - Pas connecté : les identifiants dans le message (l'OS a créé le compte ;
 *   jamais « in our first message above »).
 * - Compte TikTok pas trouvé, Start warmup pas cliqué : « create your account ».
 * - Compte TikTok pas trouvé, Start warmup cliqué : aucun message, la recrue
 *   va dans Needs you (mauvais @ ?). Jamais « create your account ».
 * - Compte trouvé, Start warmup pas cliqué : « click Start warmup ».
 * - Start warmup cliqué, moins de 5 abonnements : « follow N more accounts ».
 * Chaque élément attend son délai (Timing) : 24 h après la bienvenue, 48 h
 * après la 1re connexion, 24 h après le compte vu, 24 h après Start warmup.
 *
 * Prompt 25 v4 : l'étape 0, « Join Slack » (pas encore sur Slack, 24 h après
 * la bienvenue), s'ajoute à la prochaine étape dans le même message.
 */
import { dateAnglaise, type DelaisAccueil, type EtatAccueil, FOLLOWS_MIN, type RecrueAccueil } from "./etapes.ts";

export type ElementRelance = "slack" | "connexion" | "tiktok" | "warmup" | "follows";

export interface PlanRelance {
  /** Le 1er élément dû (null : rien ne part). */
  element: ElementRelance | null;
  /** Ce qui manque et qui est dû maintenant : l'étape 0 (Slack) puis au plus la prochaine étape. */
  elements: ElementRelance[];
  /** Start warmup cliqué, compte introuvable : Needs you, pas de message. */
  needsYou: boolean;
  /** Abonnements qui manquent (élément « follows »). */
  follows: number;
}

const H = 3_600_000;

export function planRelance(
  x: Pick<RecrueAccueil, "warmup_started_at" | "abonnements" | "tiktok_existe" | "deuxieme"> &
    Partial<Pick<RecrueAccueil, "slack_user_id" | "bienvenue_at">>,
  etats: readonly EtatAccueil[],
  maintenant: Date,
  d: Pick<DelaisAccueil, "warmup_lance_message_h"> & Partial<Pick<DelaisAccueil, "connexion_message_h">>,
  o: { slack?: boolean } = {},
): PlanRelance {
  const etape = planEtape(x, etats, maintenant, d);
  if (etape.needsYou) return { element: null, elements: [], needsYou: true, follows: 0 };
  // L'étape 0 : pas sur Slack (lien d'invitation connu), le même délai que la connexion.
  const slack = o.slack === true && !x.deuxieme && !x.slack_user_id && Boolean(x.bienvenue_at) &&
    maintenant.getTime() >= new Date(x.bienvenue_at!).getTime() + (d.connexion_message_h ?? 24) * H;
  const elements: ElementRelance[] = [...(slack ? ["slack" as const] : []), ...(etape.element ? [etape.element] : [])];
  return { element: elements[0] ?? null, elements, needsYou: false, follows: etape.follows };
}

/** La prochaine étape (1 à 4) due maintenant. */
function planEtape(
  x: Pick<RecrueAccueil, "warmup_started_at" | "abonnements" | "tiktok_existe" | "deuxieme">,
  etats: readonly EtatAccueil[],
  maintenant: Date,
  d: Pick<DelaisAccueil, "warmup_lance_message_h">,
): { element: ElementRelance | null; needsYou: boolean; follows: number } {
  const t = maintenant.getTime();
  const du = (e: EtatAccueil | undefined) => Boolean(e?.messageAt && t >= e.messageAt.getTime());
  const etat = (n: string) => etats.find((e) => e.etape === n);
  const vide = { element: null, needsYou: false, follows: 0 };

  const connexion = etat("connexion");
  if (connexion && !connexion.fait) return { ...vide, element: du(connexion) ? "connexion" : null };

  const tiktok = etat("tiktok");
  if (tiktok && !tiktok.fait) {
    if (x.warmup_started_at) return { ...vide, needsYou: true };
    return { ...vide, element: du(tiktok) ? "tiktok" : null };
  }

  const lance = etat("warmup_lance");
  if (lance && !lance.fait) return { ...vide, element: du(lance) ? "warmup" : null };

  // Start warmup cliqué : les abonnements relevés (le 2e compte d'un Double aussi).
  const manquent = Math.max(0, FOLLOWS_MIN - (x.abonnements ?? 0));
  if (x.warmup_started_at && manquent > 0 && (x.deuxieme || x.tiktok_existe === true)) {
    const depuis = new Date(x.warmup_started_at).getTime() + d.warmup_lance_message_h * H;
    return { element: t >= depuis ? "follows" : null, needsYou: false, follows: manquent };
  }
  return vide;
}

export interface TextesRelance {
  /** Le message : « Hi {prenom}, … {ce_qui_manque} … ». */
  cadre: string;
  /** L'étape 0 : rejoindre Slack ({slack} : le lien d'invitation). */
  slack: string;
  connexion: string;
  tiktok: string;
  warmup: string;
  follows: string;
}

export const TEXTES_RELANCE_DEFAUT: TextesRelance = {
  cadre: "Hi {prenom}, to start posting on Monday {date}, you still need to {ce_qui_manque}. If something is blocking you, just reply here.",
  slack: "join our Slack: {slack}",
  connexion: "log in to your dashboard: {url} (login: {email}, password: {mot_de_passe}; you can change it once logged in)",
  tiktok: "create your TikTok account @{handle} (how-to: {lien_etapes}), then click Start warmup on your dashboard and follow 5 accounts",
  warmup: "click Start warmup on your dashboard ({url}), then follow 5 accounts with @{handle}",
  follows: "follow {follows} with @{handle} (Start warmup is done)",
};

/** Les variables connues ; une variable inconnue reste telle quelle (comme ailleurs). */
function remplir(modele: string, vars: Record<string, string>): string {
  return modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout));
}

/**
 * Le texte de la relance : les éléments dus, reliés par « and ». Un élément
 * sans texte (modèle vide, identifiants sans e-mail, Slack sans lien) est
 * laissé de côté ; vide (rien ne part) s'il n'en reste aucun.
 */
export function texteRelance(
  t: TextesRelance,
  plan: PlanRelance,
  o: {
    prenom: string | null;
    handle: string | null;
    url: string;
    lien_etapes: string;
    cohorte_lundi: string;
    email: string | null | undefined;
    mot_de_passe: string;
    /** Le lien d'invitation Slack (étape 0). */
    slack?: string;
  },
): string {
  if (!t.cadre.trim()) return "";
  const vars: Record<string, string> = {
    prenom: (o.prenom ?? "").trim() || "there",
    handle: (o.handle ?? "").replace(/^@/, ""),
    url: o.url,
    lien_etapes: o.lien_etapes,
    date: dateAnglaise(o.cohorte_lundi),
    follows: `${plan.follows} more account${plan.follows > 1 ? "s" : ""}`,
    ...(o.email ? { email: o.email } : {}),
    mot_de_passe: o.mot_de_passe,
    slack: (o.slack ?? "").trim(),
  };
  const morceaux = plan.elements
    .filter((e) => !(e === "connexion" && !o.email) && !(e === "slack" && !vars.slack))
    .map((e) => remplir((t[e] ?? "").trim(), vars))
    .filter(Boolean);
  if (morceaux.length === 0) return "";
  return remplir(t.cadre, { ...vars, ce_qui_manque: morceaux.join(" and ") }).trim();
}
