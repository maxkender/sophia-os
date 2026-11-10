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
import { instantLocal } from "./relances.ts";

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
    Partial<Pick<RecrueAccueil, "slack_user_id" | "slack_connu" | "bienvenue_at">>,
  etats: readonly EtatAccueil[],
  maintenant: Date,
  d: Pick<DelaisAccueil, "warmup_lance_message_h"> & Partial<Pick<DelaisAccueil, "connexion_message_h">>,
  o: { slack?: boolean } = {},
): PlanRelance {
  const etape = planEtape(x, etats, maintenant, d);
  if (etape.needsYou) return { element: null, elements: [], needsYou: true, follows: 0 };
  // 10/11 : Slack ne bloque plus (décision du 28/10) : plus jamais de relance « pas sur Slack ».
  // Slack reste une recommandation de l'onboarding seulement (`o.slack` est ignoré).
  void o;
  const elements: ElementRelance[] = etape.element ? [etape.element] : [];
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
  // 1/11 : jamais de mot de passe (Upwork) : le lien personnel « Set my password », créé à l'envoi.
  connexion: "log in to your dashboard: {url} with your login {email} (first time: set your password with your personal link {lien_mot_de_passe})",
  tiktok: "create your TikTok account @{handle} (how-to: {lien_etapes}), then click Start warmup on your dashboard and follow 5 accounts",
  warmup: "click Start warmup on your dashboard ({url}), then follow 5 accounts with @{handle}",
  follows: "follow {follows} with @{handle} (Start warmup is done)",
};

/** 0592 : la relance d'un posteur Ruul : la date limite est le samedi 20 h (Paris), la date de début son lundi. */
export const CADRE_RELANCE_RUUL =
  "Hi {prenom}, to start posting on Monday {date}, you still need to {ce_qui_manque}. Please finish before Saturday 8 pm (Paris time). If something is blocking you, just reply to this message.";

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
    /** Le lien d'invitation Slack (étape 0). */
    slack?: string;
    /** 10/11 : ignoré : la date est toujours un lundi, celui de la cohorte (jamais « Tuesday »). */
    mardi?: boolean;
    /** 10/11 : ignoré : la date vient de profiles.cohorte_lundi, lu au moment de l'envoi. */
    maintenant?: Date;
  },
): string {
  if (!t.cadre.trim()) return "";
  // 10/11 : la date est le lundi de la cohorte (profiles.cohorte_lundi, lu à l'envoi), jamais
  // une date calculée ou mémorisée, jamais un mardi.
  const cadre = t.cadre.replace(/\bTuesday(\s+\{date\})/g, "Monday$1");
  const vars: Record<string, string> = {
    prenom: (o.prenom ?? "").trim() || "there",
    handle: (o.handle ?? "").replace(/^@/, ""),
    url: o.url,
    lien_etapes: o.lien_etapes,
    date: dateAnglaise(o.cohorte_lundi),
    follows: `${plan.follows} more account${plan.follows > 1 ? "s" : ""}`,
    ...(o.email ? { email: o.email } : {}),
    slack: (o.slack ?? "").trim(),
  };
  const morceaux = plan.elements
    .filter((e) => !(e === "connexion" && !o.email) && !(e === "slack" && !vars.slack))
    // 1/11 : un ancien texte qui donne encore un mot de passe : le texte par défaut (lien « Set my password »).
    .map((e) => remplir(((t[e] ?? "").includes("{mot_de_passe}") ? TEXTES_RELANCE_DEFAUT[e] : t[e] ?? "").trim(), vars))
    .filter(Boolean);
  if (morceaux.length === 0) return "";
  return remplir(cadre, { ...vars, ce_qui_manque: morceaux.join(" and ") }).trim();
}

/** 2/11 : le lundi où la recrue commence vraiment : celui de sa cohorte, ou le suivant après le lundi 12:00 (Paris). */
export function debutReel(cohorteLundi: string, maintenant?: Date): string {
  if (!maintenant || !/^\d{4}-\d{2}-\d{2}$/.test(cohorteLundi)) return cohorteLundi;
  const midi = instantLocal(cohorteLundi, 12, "Europe/Paris");
  if (maintenant.getTime() < midi.getTime()) return cohorteLundi;
  const d = new Date(`${cohorteLundi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1/11 : le canal de chaque relance (Slack d'abord, Upwork une fois 24 h après)
// ---------------------------------------------------------------------------

/** La dernière ligne de toute relance envoyée sur Upwork (jamais sur Slack). */
export const LIGNE_STOP_UPWORK = "If you don't wish to continue, just reply STOP here.";

export function avecLigneStop(texte: string): string {
  const t = texte.trimEnd();
  return t.endsWith(LIGNE_STOP_UPWORK) ? t : `${t}\n\n${LIGNE_STOP_UPWORK}`;
}

/** Ce qui est déjà parti pour une étape : l'heure de la relance Slack, de la relance Upwork. */
export interface DejaRelance {
  slack_at?: string | null;
  upwork_at?: string | null;
}

export interface ChoixRelance {
  element: ElementRelance | null;
  canal: "slack" | "upwork" | null;
  /** La relance Slack attend ses 24 h : l'heure à laquelle Upwork partira. */
  upwork_prevu_at: string | null;
}

/**
 * 1/11 : une seule relance par étape et par canal. Sur Slack : la relance part
 * en DM Slack, jamais sur Upwork ; l'étape toujours pas faite 24 h après : une
 * seule relance Upwork. Pas sur Slack (ou l'étape « rejoindre Slack ») : une
 * seule relance Upwork, directement. Le 1er élément dû qui a encore un canal.
 */
export function choisirRelance(
  plan: Pick<PlanRelance, "elements">,
  surSlack: boolean,
  deja: ReadonlyMap<string, DejaRelance> | undefined,
  maintenant: Date,
): ChoixRelance {
  let attente: string | null = null;
  for (const e of plan.elements) {
    const d = deja?.get(e) ?? {};
    if (surSlack && e !== "slack") {
      if (!d.slack_at) return { element: e, canal: "slack", upwork_prevu_at: null };
      if (d.upwork_at) continue;
      const due = new Date(new Date(d.slack_at).getTime() + 24 * H);
      if (maintenant >= due) return { element: e, canal: "upwork", upwork_prevu_at: null };
      attente ??= due.toISOString();
      continue;
    }
    if (!d.upwork_at) return { element: e, canal: "upwork", upwork_prevu_at: null };
  }
  return { element: null, canal: null, upwork_prevu_at: attente };
}

/** L'historique des relances parties (nudges) : par étape, l'heure de la 1re sur Slack et sur Upwork. */
export function historiqueRelances(
  envois: readonly { donnees?: { element?: unknown; elements?: unknown } | null; canaux?: string[] | null; envoye_at: string }[],
): Map<string, DejaRelance> {
  const h = new Map<string, DejaRelance>();
  for (const n of [...envois].sort((a, b) => a.envoye_at.localeCompare(b.envoye_at))) {
    const els = Array.isArray(n.donnees?.elements) ? (n.donnees!.elements as unknown[]).map(String)
      : n.donnees?.element ? [String(n.donnees.element)] : [];
    for (const e of els) {
      const d = h.get(e) ?? {};
      if ((n.canaux ?? []).includes("slack")) d.slack_at ??= n.envoye_at;
      // 0592 : l'email (posteur Ruul, par le site) tient la place d'Upwork (le canal hors Slack).
      if ((n.canaux ?? []).includes("upwork") || (n.canaux ?? []).includes("email")) d.upwork_at ??= n.envoye_at;
      h.set(e, d);
    }
  }
  return h;
}

/** 1/11 : chaque relance est signée (jamais de bot) ; le réglage `relance_signature` la change. */
export const SIGNATURE_RELANCE_DEFAUT = "Vik Studios team";

/** La relance signée (une seule fois), avant la ligne STOP d'Upwork. */
export function signerRelance(texte: string, signature: string): string {
  const t = texte.trimEnd();
  if (!signature || !t || t.endsWith(signature)) return t;
  return `${t}\n\n${signature}`;
}

/** Le même motif que l'onglet Sunday (0500) : STOP en majuscules, ou un retrait écrit en clair. */
const STOP_MAJUSCULES = /\bSTOP\b/;
const RETRAIT_ECRIT =
  /^\s*stop\s*$|have to stop|withdraw|do not wish to (proceed|continue)|don't wish to (proceed|continue)|not be able to work|won't be able to work|no longer (interested|available)|cancel (the|my) contract/im;

/** Le dernier message reçu dit STOP, ou que la recrue se retire : plus aucune relance. */
export function messageDeRetrait(texte: string | null | undefined): boolean {
  return Boolean(texte && (STOP_MAJUSCULES.test(texte) || RETRAIT_ECRIT.test(texte)));
}
