/**
 * Prompt 17, partie A (0391) : une seule relance par étape. Rien ici ne touche
 * la base ni le réseau : l'état de chaque étape, ce qui est dû à cet instant,
 * le canal, le texte. `recrues-check` s'en sert toutes les heures.
 *
 *   acces    : 1re connexion à l'OS (Slack ne bloque plus, 28 oct.) ;
 *              message offre + 24 h (Upwork), rouge offre + 48 h ;
 *   tiktok   : le pseudo existe ; message 1re connexion + 48 h (Slack, sinon
 *              Upwork), rouge 24 h après le message ;
 *   warmup   : Start warmup + 5 follows (plus de reposts, 28 oct.) ; message samedi 12 h,
 *              rouge dimanche minuit (heure du pays) ;
 *   mercredi : au moins 1 post lundi ou mardi ; message mercredi 12 h
 *              (Upwork), rouge vendredi 20 h s'il n'a toujours rien publié.
 * Un message part seulement entre 10 h et 20 h, heure du pays ; jamais
 * après le rouge (personne ne relance une recrue en rouge).
 */

export type Etape = "acces" | "tiktok" | "warmup" | "mercredi";
export const ETAPES: readonly Etape[] = ["acces", "tiktok", "warmup", "mercredi"];
export type Mode = "off" | "simulation" | "on";
export type Canal = "slack" | "upwork";

export interface Delais {
  acces_message_h: number;
  acces_rouge_h: number;
  tiktok_message_h: number;
  tiktok_rouge_h: number;
  warmup_message_heure: number;
  mercredi_message_heure: number;
  mercredi_rouge_heure: number;
  fenetre_debut: number;
  fenetre_fin: number;
}

export const DELAIS_DEFAUT: Delais = {
  acces_message_h: 24,
  acces_rouge_h: 48,
  tiktok_message_h: 48,
  tiktok_rouge_h: 24,
  warmup_message_heure: 12,
  mercredi_message_heure: 12,
  mercredi_rouge_heure: 20,
  fenetre_debut: 10,
  fenetre_fin: 20,
};

export function lireDelais(v: unknown): Delais {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const d = { ...DELAIS_DEFAUT };
  for (const k of Object.keys(d) as (keyof Delais)[]) {
    const n = Number(o[k]);
    if (o[k] !== undefined && o[k] !== null && Number.isFinite(n)) d[k] = n;
  }
  return d;
}

export function lireMode(v: unknown): Mode {
  return v === "on" || v === "off" ? v : "simulation";
}

// ---------------------------------------------------------------------------
// Heures locales
// ---------------------------------------------------------------------------

const H = 3_600_000;

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** La date, l'heure et le jour (1 = lundi) d'un instant dans un fuseau. */
export function partiesLocales(instant: Date, fuseau: string): { date: string; heure: number; isoJour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: fuseau,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(instant).map((x) => [x.type, x.value]),
  );
  const jours: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour), isoJour: jours[p.weekday] ?? 1 };
}

/** L'instant où il est `heure` h le `jour` dans `fuseau` (heure murale). */
export function instantLocal(jour: string, heure: number, fuseau: string): Date {
  const naif = Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)) - 1, Number(jour.slice(8, 10)), heure);
  // Deux passes : le décalage du fuseau à cet instant (changement d'heure compris).
  let t = naif;
  for (let i = 0; i < 2; i++) {
    const p = partiesLocales(new Date(t), fuseau);
    const vu = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.heure);
    t += naif - vu;
  }
  return new Date(t);
}

export function dansFenetre(instant: Date, fuseau: string, d: Delais): boolean {
  const h = partiesLocales(instant, fuseau).heure;
  return h >= d.fenetre_debut && h < d.fenetre_fin;
}

/** Le lundi (AAAA-MM-JJ) de la semaine d'un instant, heure de Paris. */
export function lundiParis(instant: Date): string {
  const p = partiesLocales(instant, "Europe/Paris");
  return ajouterJours(p.date, -(p.isoJour - 1));
}

// ---------------------------------------------------------------------------
// Les faits (lus par relances_recrues / relances_mercredi) et l'état des étapes
// ---------------------------------------------------------------------------

export interface NudgeConnu {
  type: string;
  periode: string | null;
  envoye_at: string;
  canal: string;
  resolu_at: string | null;
}

export interface Recrue {
  poster_id: string;
  prenom: string | null;
  hm_prenom: string | null;
  fuseau: string;
  offre_at: string;
  cohorte_lundi: string;
  premiere_connexion_at: string | null;
  slack_user_id: string | null;
  contrat_id: string | null;
  compte_id: string | null;
  handle: string | null;
  warmup_started_at: string | null;
  warmup_reposts_at: string | null;
  tiktok_existe: boolean | null;
  abonnements: number | null;
  nudges: NudgeConnu[];
  rouges: { etape: string; periode: string; decision: string | null }[];
}

export interface PosteurMercredi {
  poster_id: string;
  prenom: string | null;
  fuseau: string;
  slack_user_id: string | null;
  contrat_id: string | null;
  prevus_lun_mar: number;
  publies_lun_mar: number;
  publies_semaine: number;
  nudge_envoye_at: string | null;
  rouge: boolean;
}

/** Ce qui manque, en codes : le texte les traduit. */
export type Manque = "connexion" | "start" | "follows";

export interface EtatEtape {
  etape: Etape;
  periode: string;
  fait: boolean;
  messageAt: Date;
  rougeAt: Date;
  manque: Manque[];
  /** Follows qui manquent (warm-up). */
  followsManquants: number;
  envoyeAt: Date | null;
  dejaRouge: boolean;
}

export const FOLLOWS_MIN = 5;

/**
 * La relance déjà envoyée pour cette étape. Étapes 1 à 3 : quelle que soit la
 * période, pour que « Reporter » (nouvelle cohorte) ne redonne pas de relance.
 */
function envoi(r: { nudges: NudgeConnu[] }, etape: Etape, periode: string): NudgeConnu | undefined {
  return r.nudges.find((n) => n.type === etape && (etape !== "mercredi" || n.periode === periode));
}

function rougeDeja(r: Recrue, etape: Etape, periode: string): boolean {
  return r.rouges.some((x) => x.etape === etape && x.periode === periode);
}

/** Les étapes 1 à 3 d'une recrue (sa cohorte n'a pas encore démarré). */
export function etapesRecrue(r: Recrue, d: Delais): EtatEtape[] {
  const periode = r.cohorte_lundi;
  const etats: EtatEtape[] = [];
  const offre = new Date(r.offre_at).getTime();
  // Reportée : les étapes 1 et 2 ont jusqu'au début de sa nouvelle cohorte.
  const reportee = r.rouges.some((x) => x.decision === "reporter");
  const finCohorte = instantLocal(periode, 0, r.fuseau);

  // 1. Accès
  const manqueAcces: Manque[] = [];
  if (!r.premiere_connexion_at) manqueAcces.push("connexion");
  const envAcces = envoi(r, "acces", periode);
  etats.push({
    etape: "acces",
    periode,
    fait: manqueAcces.length === 0,
    messageAt: new Date(offre + d.acces_message_h * H),
    rougeAt: reportee ? finCohorte : new Date(offre + d.acces_rouge_h * H),
    manque: manqueAcces,
    followsManquants: 0,
    envoyeAt: envAcces ? new Date(envAcces.envoye_at) : null,
    dejaRouge: rougeDeja(r, "acces", periode),
  });

  // 2. Compte TikTok : compté à partir de la 1re connexion, et seulement s'il a un pseudo.
  if (r.premiere_connexion_at && r.handle) {
    const env = envoi(r, "tiktok", periode);
    const messageAt = new Date(new Date(r.premiere_connexion_at).getTime() + d.tiktok_message_h * H);
    const base = env ? new Date(env.envoye_at).getTime() : messageAt.getTime();
    etats.push({
      etape: "tiktok",
      periode,
      fait: r.tiktok_existe === true,
      messageAt,
      rougeAt: reportee ? finCohorte : new Date(base + d.tiktok_rouge_h * H),
      manque: r.tiktok_existe === true ? [] : ["start"],
      followsManquants: 0,
      envoyeAt: env ? new Date(env.envoye_at) : null,
      dejaRouge: rougeDeja(r, "tiktok", periode),
    });
  }

  // 3. Warm-up : samedi 12 h et dimanche minuit, avant le lundi de la cohorte.
  const manqueWarmup: Manque[] = [];
  if (!r.warmup_started_at) manqueWarmup.push("start");
  const follows = Math.max(0, FOLLOWS_MIN - (r.abonnements ?? 0));
  if (follows > 0) manqueWarmup.push("follows");
  const envWarmup = envoi(r, "warmup", periode);
  etats.push({
    etape: "warmup",
    periode,
    fait: manqueWarmup.length === 0,
    messageAt: instantLocal(ajouterJours(periode, -2), d.warmup_message_heure, r.fuseau),
    rougeAt: finCohorte,
    manque: manqueWarmup,
    followsManquants: follows,
    envoyeAt: envWarmup ? new Date(envWarmup.envoye_at) : null,
    dejaRouge: rougeDeja(r, "warmup", periode),
  });
  return etats;
}

/** L'étape 4 d'un posteur actif, pour la semaine du lundi `lundi`. */
export function etapeMercredi(p: PosteurMercredi, lundi: string, d: Delais): EtatEtape {
  return {
    etape: "mercredi",
    periode: lundi,
    fait: p.publies_lun_mar > 0,
    messageAt: instantLocal(ajouterJours(lundi, 2), d.mercredi_message_heure, p.fuseau),
    rougeAt: instantLocal(ajouterJours(lundi, 4), d.mercredi_rouge_heure, p.fuseau),
    manque: [],
    followsManquants: 0,
    envoyeAt: p.nudge_envoye_at ? new Date(p.nudge_envoye_at) : null,
    dejaRouge: p.rouge,
  };
}

export interface Decision {
  /** L'étape est faite (mercredi : un post publié depuis lundi suffit). */
  fait: boolean;
  /** Faite : ferme la relance envoyée (resolu_at). */
  resoudre: boolean;
  /** Pas faite à la fin du délai : passe en rouge (une fois). */
  rouge: boolean;
  /** Le message est dû maintenant (une fois, jamais après le rouge). */
  envoyer: boolean;
  /** Dû, mais hors de 10 h-20 h (heure du pays) : il partira à 10 h. */
  horsFenetre: boolean;
}

/**
 * Que faire de cette étape à cet instant. Pour mercredi, `publieSemaine` dit
 * s'il a publié depuis lundi : le rouge de vendredi 20 h ne tombe que s'il
 * n'a toujours rien publié.
 */
export function decider(e: EtatEtape, maintenant: Date, fuseau: string, d: Delais, publieSemaine?: boolean): Decision {
  const t = maintenant.getTime();
  // Mercredi : un post publié depuis lundi (même mercredi matin) suffit à ne pas écrire.
  const fait = e.fait || (e.etape === "mercredi" && Boolean(publieSemaine));
  if (fait) return { fait, resoudre: e.envoyeAt !== null, rouge: false, envoyer: false, horsFenetre: false };
  const rouge = !e.dejaRouge && t >= e.rougeAt.getTime();
  const du = !e.envoyeAt && t >= e.messageAt.getTime() && t < e.rougeAt.getTime();
  const fenetre = dansFenetre(maintenant, fuseau, d);
  return { fait, resoudre: false, rouge, envoyer: du && fenetre, horsFenetre: du && !fenetre };
}

// ---------------------------------------------------------------------------
// Canal et texte
// ---------------------------------------------------------------------------

export type ChoixCanal = { canal: Canal } | { canal: null; raison: "contrat_non_relie" };

/** Accès et mercredi : Upwork ; TikTok et warm-up : Slack, sinon Upwork. */
export function choisirCanal(etape: Etape, p: { slack_user_id: string | null; contrat_id: string | null }): ChoixCanal {
  if ((etape === "tiktok" || etape === "warmup") && p.slack_user_id) return { canal: "slack" };
  if (p.contrat_id) return { canal: "upwork" };
  return { canal: null, raison: "contrat_non_relie" };
}

export const FIN_UPWORK = "You can reply here or on Slack. — The Vik Studios team";

/** « Monday 2 November » → on garde « 2 November » ; le texte dit déjà « Monday ». */
export function dateAnglaise(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`));
}

export function texteManque(
  etape: Etape,
  manque: Manque[],
  o: { url: string; slack: string; follows: number },
): string {
  const morceaux: string[] = [];
  for (const m of manque) {
    if (etape === "acces" && m === "connexion") morceaux.push(`log in to your dashboard: ${o.url}`);
    if (etape === "warmup" && m === "start") morceaux.push('click "Start warmup"');
    if (etape === "warmup" && m === "follows") morceaux.push(`follow ${o.follows} more accounts`);
  }
  return etape === "acces" ? morceaux.join(" and ") : morceaux.join(", ");
}

/** Le message, depuis le texte du réglage. Sur Upwork, la signature à la fin. */
export function composerTexte(
  modele: string,
  e: EtatEtape,
  o: { prenom: string | null; handle: string | null; url: string; slack: string; canal: Canal },
): string {
  const vars: Record<string, string> = {
    prenom: (o.prenom ?? "").trim() || "there",
    date: dateAnglaise(e.periode),
    url: o.url,
    slack: o.slack,
    handle: o.handle ?? "",
    n: String(e.followsManquants),
    manque: texteManque(e.etape, e.manque, { url: o.url, slack: o.slack, follows: e.followsManquants }),
  };
  const corps = modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();
  return o.canal === "upwork" ? `${corps}\n\n${FIN_UPWORK}` : corps;
}
