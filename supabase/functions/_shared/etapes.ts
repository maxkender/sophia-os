/**
 * Système du 2 nov., partie B : les 4 étapes de l'accueil et le Kill à 48 h
 * (remplace les étapes du prompt 17 A). Rien ici ne touche la base ni le
 * réseau : l'état de chaque étape, ce qui est dû à cet instant, le texte.
 *
 *   1. connexion        faite : 1re connexion à l'OS ; message bienvenue + 24 h
 *   2. tiktok           faite : le @ donné par l'OS existe ; message connexion + 48 h
 *   3. warmup_lance     faite : « Start warmup » cliqué ; message compte créé + 24 h
 *   4. warmup_bien_fait faite : 5 follows et aucun post publié ; message samedi 12 h
 *
 * Une étape = un seul message (entre 10 h et 20 h, heure du pays). Aucune
 * réaction 48 h après ce message (étape faite, ou réponse) = Kill automatique,
 * annulable pendant 12 h.
 */
import { ajouterJours, dansFenetre, type Delais, instantLocal } from "./relances.ts";

export type EtapeAccueil = "connexion" | "tiktok" | "warmup_lance" | "warmup_bien_fait";
export const ETAPES_ACCUEIL: readonly EtapeAccueil[] = ["connexion", "tiktok", "warmup_lance", "warmup_bien_fait"];

export interface DelaisAccueil {
  connexion_message_h: number;
  tiktok_message_h: number;
  warmup_lance_message_h: number;
  /** Le jour avant la cohorte (`warmup_bien_fait_jour`), à cette heure (heure du pays). */
  warmup_bien_fait_heure: number;
  /** Le jour du message de l'étape 4, jour ISO avant le lundi de la cohorte : 6 = samedi (0411). */
  warmup_bien_fait_jour: number;
  /** Sans réaction ce nombre d'heures après le message : Kill. */
  kill_h: number;
  /** Le Kill reste annulable ce nombre d'heures (page Cohorts). */
  kill_annulation_h: number;
  fenetre_debut: number;
  fenetre_fin: number;
}

export const DELAIS_ACCUEIL_DEFAUT: DelaisAccueil = {
  connexion_message_h: 24,
  tiktok_message_h: 48,
  warmup_lance_message_h: 24,
  warmup_bien_fait_heure: 12,
  warmup_bien_fait_jour: 6,
  kill_h: 48,
  kill_annulation_h: 12,
  fenetre_debut: 10,
  fenetre_fin: 20,
};

export function lireDelaisAccueil(v: unknown): DelaisAccueil {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const d = { ...DELAIS_ACCUEIL_DEFAUT };
  for (const k of Object.keys(d) as (keyof DelaisAccueil)[]) {
    const n = Number(o[k]);
    if (o[k] !== undefined && o[k] !== null && Number.isFinite(n)) d[k] = n;
  }
  return d;
}

/** Jour ISO (1 = lundi … 7 = dimanche) → jours avant le lundi qui suit : samedi → 2. Hors 1-7 : samedi. */
export function joursAvantLundi(jourIso: number): number {
  const j = Number.isInteger(jourIso) && jourIso >= 1 && jourIso <= 7 ? jourIso : 6;
  return 8 - j;
}

export const FOLLOWS_MIN = 5;

export interface MessageEtape {
  type: string;
  envoye_at: string;
  reponse_at: string | null;
  id?: string;
  /** L'envoi a échoué (noté sur le nudge) : jamais renvoyé, jamais de Kill. */
  erreur?: string | null;
}

/** Ce que le mode « test » aurait envoyé (relances_prevues), depuis le 1er passage. */
export interface PrevueEtape {
  type: string;
  premier_at: string;
  statut: "prevu" | "bloque";
  raison: string | null;
}

export interface KillConnu {
  id: string;
  etape: EtapeAccueil;
  statut: "simule" | "en_attente" | "annule" | "parti" | "erreur";
  prevu_at: string;
}

/** Une recrue telle que `etapes_recrues()` la rend (0402). */
export interface RecrueAccueil {
  poster_id: string;
  prenom: string | null;
  fuseau: string;
  /** Le message de bienvenue (accueil automatique), sinon l'offre acceptée. */
  bienvenue_at: string;
  cohorte_lundi: string;
  premiere_connexion_at: string | null;
  slack_user_id: string | null;
  contrat_id: string | null;
  compte_id: string | null;
  handle: string | null;
  warmup_started_at: string | null;
  tiktok_existe: boolean | null;
  /** Le 1er relevé où le compte existait : sa « création » vue par l'OS. */
  tiktok_vu_at: string | null;
  abonnements: number | null;
  videos: number | null;
  /** Les messages d'étape déjà envoyés (nudges, période = cohorte). */
  messages: MessageEtape[];
  /** Les messages prévus en test (ou bloqués). */
  prevues: PrevueEtape[];
  /** La dernière réponse du posteur (Slack, bouton, Upwork). */
  repondu_at: string | null;
  /** Les Kills automatiques déjà notés pour cette cohorte. */
  kill: KillConnu[] | null;
}

export type ManqueWarmup = "start" | "follows" | "posts";

export interface EtatAccueil {
  etape: EtapeAccueil;
  fait: boolean;
  /** Quand l'étape peut être relancée ; null : pas encore (étape d'avant pas faite). */
  messageAt: Date | null;
  manque: ManqueWarmup[];
  followsManquants: number;
  message: MessageEtape | null;
}

const H = 3_600_000;

export function etatsAccueil(r: RecrueAccueil, d: DelaisAccueil): EtatAccueil[] {
  const msg = (e: EtapeAccueil) => r.messages.find((m) => m.type === e) ?? null;
  const etats: EtatAccueil[] = [];
  // 1. Connexion
  etats.push({
    etape: "connexion",
    fait: Boolean(r.premiere_connexion_at),
    messageAt: new Date(new Date(r.bienvenue_at).getTime() + d.connexion_message_h * H),
    manque: [],
    followsManquants: 0,
    message: msg("connexion"),
  });
  // 2. Compte TikTok : compté depuis la 1re connexion, s'il a un @.
  etats.push({
    etape: "tiktok",
    fait: r.tiktok_existe === true,
    messageAt: r.premiere_connexion_at && r.handle
      ? new Date(new Date(r.premiere_connexion_at).getTime() + d.tiktok_message_h * H)
      : null,
    manque: [],
    followsManquants: 0,
    message: msg("tiktok"),
  });
  // 3. Warm-up lancé : compté depuis la création du compte (1er relevé où il existe).
  etats.push({
    etape: "warmup_lance",
    fait: Boolean(r.warmup_started_at),
    messageAt: r.tiktok_existe && r.tiktok_vu_at
      ? new Date(new Date(r.tiktok_vu_at).getTime() + d.warmup_lance_message_h * H)
      : null,
    manque: r.warmup_started_at ? [] : ["start"],
    followsManquants: 0,
    message: msg("warmup_lance"),
  });
  // 4. Warm-up bien fait : 5 follows et aucun post publié, vérifié le jour et
  // à l'heure du réglage (samedi 12 h par défaut).
  const follows = Math.max(0, FOLLOWS_MIN - (r.abonnements ?? 0));
  const manque: ManqueWarmup[] = [];
  if (!r.warmup_started_at) manque.push("start");
  if (follows > 0) manque.push("follows");
  if ((r.videos ?? 0) > 0) manque.push("posts");
  etats.push({
    etape: "warmup_bien_fait",
    fait: manque.length === 0 && r.tiktok_existe === true,
    messageAt: r.warmup_started_at
      ? instantLocal(ajouterJours(r.cohorte_lundi, -joursAvantLundi(d.warmup_bien_fait_jour)), d.warmup_bien_fait_heure, r.fuseau)
      : null,
    manque,
    followsManquants: follows,
    message: msg("warmup_bien_fait"),
  });
  return etats;
}

export interface DecisionEtape {
  /** Le message de l'étape est dû maintenant (une fois). */
  envoyer: boolean;
  /** Dû, mais hors de 10 h-20 h (heure du pays) : il partira à 10 h. */
  horsFenetre: boolean;
  /** 48 h après le message, sans étape faite ni réponse : Kill automatique. */
  kill: boolean;
}

/**
 * Que faire de cette étape à cet instant. `envoyeAt` : le message envoyé (ou,
 * en test, noté comme prévu) ; `reponduAt` : une réponse du posteur ;
 * `debut` : lundi 0 h de la cohorte (heure du pays), plus aucun message
 * d'étape ensuite (le Kill d'un message déjà parti continue).
 */
export function deciderEtape(
  e: EtatAccueil,
  maintenant: Date,
  fuseau: string,
  d: DelaisAccueil,
  o: { envoyeAt: Date | null; reponduAt: Date | null; debut?: Date | null },
): DecisionEtape {
  if (e.fait) return { envoyer: false, horsFenetre: false, kill: false };
  const t = maintenant.getTime();
  if (o.envoyeAt) {
    const reponse = o.reponduAt !== null && o.reponduAt.getTime() >= o.envoyeAt.getTime();
    const kill = !reponse && t >= o.envoyeAt.getTime() + d.kill_h * H;
    return { envoyer: false, horsFenetre: false, kill };
  }
  if (o.debut && t >= o.debut.getTime()) return { envoyer: false, horsFenetre: false, kill: false };
  const du = e.messageAt !== null && t >= e.messageAt.getTime();
  const fenetre = dansFenetre(maintenant, fuseau, d as unknown as Delais);
  return { envoyer: du && fenetre, horsFenetre: du && !fenetre, kill: false };
}

/** Ce qui manque au warm-up, en anglais. */
export function texteCeQuiManque(manque: ManqueWarmup[], follows: number): string {
  const morceaux: string[] = [];
  if (manque.includes("start")) morceaux.push('click "Start warmup" on your dashboard');
  if (manque.includes("follows")) morceaux.push(`follow ${follows} more account${follows > 1 ? "s" : ""}`);
  if (manque.includes("posts")) morceaux.push("delete any post on your account (don't post before Monday)");
  return morceaux.join(", ");
}

/** « 2 November » : le texte dit déjà « Monday ». */
export function dateAnglaise(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`));
}

/** Le message d'une étape, depuis le texte du réglage ; une variable inconnue reste telle quelle. */
export function texteEtape(
  modele: string,
  e: EtatAccueil,
  o: { prenom: string | null; handle: string | null; url: string; lien_etapes: string; cohorte_lundi: string },
): string {
  const vars: Record<string, string> = {
    prenom: (o.prenom ?? "").trim() || "there",
    handle: (o.handle ?? "").replace(/^@/, ""),
    url: o.url,
    lien_etapes: o.lien_etapes,
    date: dateAnglaise(o.cohorte_lundi),
    ce_qui_manque: texteCeQuiManque(e.manque, e.followsManquants),
  };
  return modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();
}

/** Le canal : Slack si relié, sinon Upwork ; ni l'un ni l'autre : bloqué. */
/**
 * Le message d'une étape tel qu'il compte pour le Kill. Un vrai message
 * (nudge) d'abord ; en test, le 1er passage où il était prévu. `reel` : le
 * message est vraiment parti (sans erreur) : seul un Kill réel peut en sortir.
 */
export function envoiEtape(
  r: Pick<RecrueAccueil, "messages" | "prevues">,
  etape: EtapeAccueil,
  test: boolean,
): { envoyeAt: Date | null; reel: boolean; nudgeId: string | null } {
  const m = r.messages.find((x) => x.type === etape);
  if (m) return { envoyeAt: new Date(m.envoye_at), reel: !m.erreur, nudgeId: m.id ?? null };
  const p = test ? r.prevues.find((x) => x.type === etape && x.statut === "prevu" && x.raison === "simulation") : null;
  return { envoyeAt: p ? new Date(p.premier_at) : null, reel: false, nudgeId: null };
}

/** Le Kill noté pour une étape, s'il y en a un. */
export function killEtape(r: Pick<RecrueAccueil, "kill">, etape: EtapeAccueil): KillConnu | null {
  return (r.kill ?? []).find((k) => k.etape === etape) ?? null;
}

/** Un Kill en attente ou parti : plus aucun message d'étape pour ce posteur. */
export function killEnCours(r: Pick<RecrueAccueil, "kill">): boolean {
  return (r.kill ?? []).some((k) => k.statut === "en_attente" || k.statut === "parti");
}

/** Lundi 0 h de la cohorte, heure du pays : la fin de l'accueil. */
export function debutCohorte(r: Pick<RecrueAccueil, "cohorte_lundi" | "fuseau">): Date {
  return instantLocal(r.cohorte_lundi, 0, r.fuseau);
}

/**
 * La 1re étape pas faite, pour le rouge de dimanche minuit (heure du pays) :
 * la recrue ne commence pas lundi. Les vidéos ne comptent pas (une fois la
 * cohorte commencée, ce sont ses posts). Rend l'étape de `recrues_rouges`
 * (acces, tiktok, warmup), null si tout est fait.
 */
export function etapeRouge(r: RecrueAccueil, d: DelaisAccueil): "acces" | "tiktok" | "warmup" | null {
  const e = etatsAccueil({ ...r, videos: null }, d).find((x) => !x.fait);
  if (!e) return null;
  return e.etape === "connexion" ? "acces" : e.etape === "tiktok" ? "tiktok" : "warmup";
}

/** Le rouge ne se pose que la nuit du dimanche au lundi (24 h), jamais après coup. */
export function nuitDuRouge(r: Pick<RecrueAccueil, "cohorte_lundi" | "fuseau">, maintenant: Date): boolean {
  const debut = debutCohorte(r).getTime();
  return maintenant.getTime() >= debut && maintenant.getTime() < debut + 24 * H;
}

export function canalEtape(p: { slack_user_id: string | null; contrat_id: string | null }): "slack" | "upwork" | null {
  if (p.slack_user_id) return "slack";
  if (p.contrat_id) return "upwork";
  return null;
}
