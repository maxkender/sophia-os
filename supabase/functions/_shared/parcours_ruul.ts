/**
 * 0688 — PARCOURS POSTEUR RUUL, version définitive (Max, 12/11).
 * Un seul moteur décide, pour chaque posteur Ruul, de l'email à envoyer maintenant (ou de rien) :
 *   bienvenue · « you start tomorrow » (dimanche 20 h) · report au lundi suivant (pas prêt dimanche
 *   minuit) · désactivation après 14 jours sans aucune activité · jamais connecté (J+1) · TikTok ·
 *   warm-up · Slack · Ruul pas prêt (tous les 2 jours, 6 au plus, puis une carte pour Adrien).
 * Règles : une seule relance par étape (sauf Ruul) ; jamais 2 emails le même jour (heure de Paris) ;
 * STOP / « I do not wish to continue » toujours respectés. Tous les textes en anglais, simples.
 * Les emails A/B (« Invited » / « Active » dans Ruul) restent envoyés par l'import Ruul.
 */
import { ajouterJours, dateAnglaise, partiesLocales } from "./relances.ts";

const H = 3_600_000;
const JOUR = 24 * H;
export const PARIS = "Europe/Paris";
export const RUUL_MAX = 6;
export const FOLLOWS_MIN = 5;
export const INACTIF_JOURS = 14;
export const PHRASE_HELP = "Have a question or a problem? Don't reply to this email: click Help on your dashboard, you'll get an answer there.";

export interface EtatParcours {
  poster_id: string;
  prenom: string | null;
  login: string | null;
  email: string | null;
  cohorte_lundi: string | null;
  cree_at: string;
  premiere_connexion_at: string | null;
  handle: string | null;
  tiktok_existe: boolean | null;
  warmup_started_at: string | null;
  abonnements: number | null;
  slack_user_id: string | null;
  ruul_statut: string | null;
  ruul_compte: string | null;
  ruul_email_a_at: string | null;
  ruul_email_b_at: string | null;
  relances_stop_at: string | null;
  ruul_jeton: string | null;
  posts: number;
  envois: { cle: string; type: string; at: string; ok: boolean }[];
}

export type TypeParcours =
  | "bienvenue" | "demain" | "report" | "desactivation" | "jamais_connecte" | "tiktok" | "warmup" | "slack" | "ruul" | "carte_ruul";

export interface Decision {
  type: TypeParcours;
  /** Unique par posteur : une étape n'est envoyée qu'une fois (ruul_1 … ruul_6, demain:<lundi>…). */
  cle: string;
  /** report : le nouveau lundi. */
  lundi?: string;
}

/** Prêt à poster lundi : connecté, TikTok créé, warm-up lancé avec au moins 5 abonnements. */
export function estPret(e: EtatParcours): boolean {
  return !!e.premiere_connexion_at && e.tiktok_existe === true && !!e.warmup_started_at && (e.abonnements ?? 0) >= FOLLOWS_MIN;
}

export function ruulPret(e: EtatParcours): boolean {
  return e.ruul_statut === "pret" || e.ruul_statut === "paye_1x";
}

/** Aucune activité depuis la création : ni connexion, ni TikTok, ni warm-up, ni post. */
export function inactif14(e: EtatParcours, maintenant: Date): boolean {
  return maintenant.getTime() - new Date(e.cree_at).getTime() >= INACTIF_JOURS * JOUR &&
    !e.premiere_connexion_at && e.tiktok_existe !== true && !e.warmup_started_at && e.posts === 0;
}

function envoye(e: EtatParcours, cle: string): boolean {
  return e.envois.some((x) => x.cle === cle && x.ok);
}

/** Un email est-il déjà parti aujourd'hui (Paris) : un email du parcours ou un email A/B ? */
export function emailAujourdhui(e: EtatParcours, maintenant: Date): boolean {
  const auj = partiesLocales(maintenant, PARIS).date;
  const dates = [...e.envois.filter((x) => x.ok && x.type !== "carte_ruul").map((x) => x.at), e.ruul_email_a_at, e.ruul_email_b_at]
    .filter((x): x is string => !!x);
  return dates.some((d) => partiesLocales(new Date(d), PARIS).date === auj);
}

/** Les relances Ruul déjà parties (ruul_1 … ruul_6) et la date de la dernière (ou de l'email A/B). */
export function etatRuul(e: EtatParcours): { n: number; depuis: string | null } {
  const r = e.envois.filter((x) => x.ok && x.type === "ruul").sort((a, b) => a.at.localeCompare(b.at));
  const ab = [e.ruul_email_a_at, e.ruul_email_b_at].filter((x): x is string => !!x).sort();
  return { n: r.length, depuis: r.at(-1)?.at ?? ab.at(-1) ?? null };
}

/**
 * L'email à envoyer maintenant à ce posteur (ou rien). `bienvenue` : l'interrupteur de l'email de
 * bienvenue ; `bienvenueDepuis` : seuls les comptes créés après l'allumage la reçoivent (jamais les
 * posteurs déjà en place).
 */
export function prochainEnvoi(e: EtatParcours, maintenant: Date, o: { bienvenue: boolean; bienvenueDepuis?: string | null }): Decision | null {
  if (e.relances_stop_at || !e.email) return null;
  const t = maintenant.getTime();
  const p = partiesLocales(maintenant, PARIS);

  // La carte « Ruul jamais fini » n'est pas un email : elle passe même un jour où un email est parti.
  const ruul = etatRuul(e);
  const ruulEnCours = !ruulPret(e) && (!!e.ruul_email_a_at || !!e.ruul_email_b_at);
  if (ruulEnCours && ruul.n >= RUUL_MAX && ruul.depuis && t - new Date(ruul.depuis).getTime() >= 2 * JOUR && !envoye(e, "carte_ruul")) {
    return { type: "carte_ruul", cle: "carte_ruul" };
  }
  if (emailAujourdhui(e, maintenant)) return null;

  if (o.bienvenue && o.bienvenueDepuis && e.cree_at >= o.bienvenueDepuis && !envoye(e, "bienvenue")) {
    return { type: "bienvenue", cle: "bienvenue" };
  }

  // Dimanche 20 h → minuit : « you start tomorrow » à qui est prêt pour le lendemain.
  if (e.cohorte_lundi && p.isoJour === 7 && p.heure >= 20 && e.cohorte_lundi === ajouterJours(p.date, 1) && estPret(e)) {
    const cle = `demain:${e.cohorte_lundi}`;
    if (!envoye(e, cle)) return { type: "demain", cle };
  }
  // Lundi (Paris) : pas prêt pour la cohorte du jour (ou d'avant) → lundi suivant, sans décision.
  if (e.cohorte_lundi && e.cohorte_lundi <= p.date && p.isoJour === 1 && e.posts === 0 && !estPret(e)) {
    const lundi = ajouterJours(p.date, 7);
    return { type: "report", cle: `report:${lundi}`, lundi };
  }
  if (inactif14(e, maintenant)) return { type: "desactivation", cle: "desactivation" };

  // Les relances d'étape ne concernent qu'un posteur qui a un lundi de début (pas les anciens sans cohorte).
  if (!e.cohorte_lundi) return ruulEnCours && ruul.n < RUUL_MAX && ruul.depuis && t - new Date(ruul.depuis).getTime() >= 2 * JOUR
    ? { type: "ruul", cle: `ruul_${ruul.n + 1}` } : null;
  const cree = new Date(e.cree_at).getTime();
  if (!e.premiere_connexion_at) {
    if (t - cree >= JOUR && !envoye(e, "jamais_connecte")) return { type: "jamais_connecte", cle: "jamais_connecte" };
  } else {
    const co = new Date(e.premiere_connexion_at).getTime();
    if (e.tiktok_existe !== true && t - co >= JOUR && !envoye(e, "tiktok")) return { type: "tiktok", cle: "tiktok" };
    if (e.tiktok_existe === true && (!e.warmup_started_at || (e.abonnements ?? 0) < FOLLOWS_MIN) && t - co >= JOUR && !envoye(e, "warmup")) {
      return { type: "warmup", cle: "warmup" };
    }
    if (!e.slack_user_id && t - co >= 2 * JOUR && !envoye(e, "slack")) return { type: "slack", cle: "slack" };
  }
  if (ruulEnCours && ruul.n < RUUL_MAX && ruul.depuis && t - new Date(ruul.depuis).getTime() >= 2 * JOUR) {
    return { type: "ruul", cle: `ruul_${ruul.n + 1}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Les textes (anglais, simples ; jamais « bot », « IA », « automatique »)
// ---------------------------------------------------------------------------

export interface DonneesEmail {
  prenom: string | null;
  login: string | null;
  motDePasse: string;
  dashboard: string;
  handle: string | null;
  slack: string;
  cohorte_lundi: string | null;
  ruul_email: string | null;
  abonnements: number | null;
  /** report : le nouveau lundi. */
  lundi?: string;
  /** relance Ruul : son numéro (1 à 6). */
  numero?: number;
}

export interface Email {
  objet: string;
  corps: string;
  bouton?: { texte: string; lien: string };
}

/** « Monday, November 16 » et l'échéance « Sunday, November 15 at midnight (Paris time) ». */
export function jourLundi(lundi: string): string {
  return `Monday, ${dateAnglaise(lundi)}`;
}
export function echeance(lundi: string): string {
  return `Sunday, ${dateAnglaise(ajouterJours(lundi, -1))} at midnight (Paris time)`;
}

function bonjour(d: DonneesEmail): string {
  return `Hi ${d.prenom?.trim() || "there"},`;
}

function acces(d: DonneesEmail): string {
  return [
    "Your access:",
    `- Dashboard: ${d.dashboard}`,
    `- Login: ${d.login ?? "(see your dashboard)"}`,
    `- Password: ${d.motDePasse}`,
    ...(d.handle ? [`- Your TikTok account, with this exact name: @${d.handle}`] : []),
    `- Our Slack (sign up with your personal email and your full name): ${d.slack}`,
  ].join("\n");
}

/** Le texte d'un email du parcours (le pied « Help » et « I do not wish to continue » sont ajoutés au rendu). */
export function emailParcours(type: Exclude<TypeParcours, "carte_ruul">, d: DonneesEmail, lienPret: string): Email {
  const lundi = d.cohorte_lundi;
  const debut = lundi ? jourLundi(lundi) : "your start Monday";
  const avant = lundi ? echeance(lundi) : "Sunday at midnight (Paris time)";
  switch (type) {
    case "bienvenue":
      return {
        objet: "Welcome to Vik Studios — your access and next steps",
        corps: [
          bonjour(d),
          "Welcome to Vik Studios! Your job: post 2 slideshows a day on TikTok. Everything you post is ready for you on your dashboard.",
          `You start on ${debut}.`,
          acces(d),
          `Before ${avant}:\n1. Log in to your dashboard.\n2. Create your TikTok account with the exact name above.\n3. Click « Start warmup » on your dashboard, follow at least 5 accounts and use TikTok normally.\n4. Join Slack.`,
          "How you get paid: within 24 hours you'll receive an invitation from Ruul, the platform we use to pay you. Create your account from that email, verify your ID and add your bank account. You're paid every Monday for the week you posted (Monday to Sunday).",
        ].join("\n\n"),
      };
    case "jamais_connecte":
      return {
        objet: "Your Vik Studios access",
        corps: [bonjour(d), "You haven't logged in to your dashboard yet. Here are your access details again:", acces(d),
          `Log in before ${avant} so you can start on ${debut}.`].join("\n\n"),
      };
    case "tiktok":
      return {
        objet: "Next step: create your TikTok account",
        corps: [bonjour(d),
          `Next step: create your TikTok account${d.handle ? ` with this exact name: @${d.handle}` : ""}. The name, bio and photo are on your dashboard (${d.dashboard}).`,
          `Do it before ${avant} so you can start on ${debut}.`].join("\n\n"),
      };
    case "warmup": {
      const manque = Math.max(0, FOLLOWS_MIN - (d.abonnements ?? 0));
      return {
        objet: "Next step: start your TikTok warm-up",
        corps: [bonjour(d),
          `Next step: click « Start warmup » on your dashboard (${d.dashboard}), follow at least 5 accounts${manque && manque < FOLLOWS_MIN ? ` (${manque} more to go)` : ""} and use TikTok normally for a few minutes a day.`,
          `Do it before ${avant} so you can start on ${debut}.`].join("\n\n"),
      };
    }
    case "slack":
      return {
        objet: "Join our Slack",
        corps: [bonjour(d), `Last step: join our Slack. Sign up with your personal email and your full name: ${d.slack}`,
          "That's where you'll get news and tips from the team."].join("\n\n"),
      };
    case "ruul":
      return {
        objet: "Reminder: finish your Ruul account to get paid",
        corps: [bonjour(d),
          `Your Ruul account isn't ready yet, so we can't pay you. It takes about 10 minutes:\n1. Open the email from Ruul sent to ${d.ruul_email ?? "your email"} (check spam too).\n2. Create your account with that same email address, using your real name as on your ID.\n3. Verify your identity (ID + selfie).\n4. Add your bank account.\n5. Click the button below.`,
          "You're paid every Monday for the week you posted (Monday to Sunday)."].join("\n\n"),
        bouton: { texte: "It's done", lien: lienPret },
      };
    case "report": {
      const nouveau = d.lundi ? jourLundi(d.lundi) : "next Monday";
      return {
        objet: `You'll start on ${nouveau}`,
        corps: [bonjour(d),
          `Your setup wasn't finished by Sunday midnight, so you'll start one week later, on ${nouveau}.`,
          `Finish these steps before ${d.lundi ? echeance(d.lundi) : "next Sunday at midnight (Paris time)"}:\n1. Log in to your dashboard (${d.dashboard}).\n2. Create your TikTok account${d.handle ? ` (@${d.handle})` : ""}.\n3. Click « Start warmup », follow at least 5 accounts and use TikTok normally.\n4. Join Slack.`].join("\n\n"),
      };
    }
    case "demain":
      return {
        objet: "Reminder: you start posting tomorrow",
        corps: [bonjour(d), "You start posting tomorrow. Here's how it works:",
          "- Your posts are on your dashboard from Monday morning.\n- 2 slideshows a day, 7 days a week.\n- Keep at least 5 follows and keep using TikTok normally.\n- Paste the link of each post on your dashboard.\n- You're paid every Monday for the week you posted.",
          `Dashboard: ${d.dashboard}`].join("\n\n"),
      };
    case "desactivation":
      return {
        objet: "Your Vik Studios access has been closed",
        corps: [bonjour(d),
          "We haven't seen any activity on your account for 14 days, so we've closed your access. You won't receive any more emails from us.",
          "If you'd still like to work with us, you can apply again on our website."].join("\n\n"),
      };
  }
}

// ---------------------------------------------------------------------------
// Point 12 : le point du soir de Max (21 h, 5 lignes), dans le bilan du soir
// ---------------------------------------------------------------------------

const LIBELLES_ENVOIS: Record<string, string> = {
  bienvenue: "bienvenue",
  jamais_connecte: "jamais connecté",
  tiktok: "TikTok",
  warmup: "warm-up",
  slack: "Slack",
  ruul: "Ruul pas prêt",
  report: "report d'une semaine",
  demain: "you start tomorrow",
  desactivation: "désactivation",
  carte_ruul: "carte Ruul jamais fini",
};

export interface PointSoirRuul {
  /** Les posteurs Ruul actifs (ruul_parcours_etat). */
  etats: EtatParcours[];
  /** Les envois du parcours d'aujourd'hui (Paris). */
  envois: { type: string; ok: boolean }[];
  /** Les arrêts Ruul d'aujourd'hui, par source. */
  arrets: { source: string }[];
}

/** Les 5 lignes : prêts / pas prêts, emails par type, désactivés, erreurs, ce que Max doit faire. */
export function lignesPointSoirRuul(d: PointSoirRuul): string[] {
  const prets = d.etats.filter((e) => estPret(e) && !!e.slack_user_id && ruulPret(e)).length;
  const pasPrets = d.etats.length - prets;
  const sansRuul = d.etats.filter((e) => !ruulPret(e)).length;
  const ok = d.envois.filter((x) => x.ok && x.type !== "carte_ruul");
  const parType = new Map<string, number>();
  for (const x of ok) parType.set(x.type, (parType.get(x.type) ?? 0) + 1);
  const emails = [...parType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${LIBELLES_ENVOIS[t] ?? t} ${n}`).join(" · ");
  const sources: Record<string, string> = { je_ne_veux_plus: "arrêtés par le posteur", manuel: "14 jours inactifs", kill_samedi: "Kill du samedi" };
  const parSource = new Map<string, number>();
  for (const a of d.arrets) parSource.set(a.source, (parSource.get(a.source) ?? 0) + 1);
  const desactives = [...parSource.entries()].map(([s, n]) => `${n} ${sources[s] ?? s}`).join(" · ");
  const erreurs = d.envois.filter((x) => !x.ok).length;
  const cartes = d.envois.filter((x) => x.ok && x.type === "carte_ruul").length;
  const aFaire = [
    ...(cartes ? [`${cartes} carte${cartes > 1 ? "s" : ""} « Ruul jamais fini » (Problèmes)`] : []),
    ...(erreurs ? [`${erreurs} envoi${erreurs > 1 ? "s" : ""} en erreur à regarder`] : []),
  ];
  return [
    `Ruul : ${prets} prêts · ${pasPrets} pas prêts (dont ${sansRuul} sans Ruul fini)`,
    `• Emails envoyés : ${emails || "aucun"}`,
    `• Désactivés : ${desactives || "aucun"}`,
    `• Erreurs : ${erreurs}`,
    `• À faire : ${aFaire.length ? aFaire.join(" ; ") : "rien"}`,
  ];
}
