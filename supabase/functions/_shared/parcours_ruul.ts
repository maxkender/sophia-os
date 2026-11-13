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
/** 13/11 (Max) : la phrase des messages d'entrée, mot pour mot (accueil Upwork, bienvenue Ruul, encart du dashboard). */
export const PHRASE_QUESTION_OS =
  "Any question about the job? Ask it in the Sophia OS: log in to your dashboard and click Help. You'll get an answer right away, and you can escalate to our team if needed.";
/** 13/11 (Max, confirmé par le support Ruul) : un posteur « Invited » s'inscrit lui-même, sans attendre d'email. */
export const LIEN_RUUL = "https://app.ruul.io/register";
export function texteInviteRuul(email: string | null): string {
  return `Go to app.ruul.io and sign up with this exact email: ${email ?? "your email"}. Then add your ID and bank details (5 minutes). You don't need to wait for an email from Ruul.`;
}
/**
 * 13/11 (Max) : le guide Ruul pas à pas (posteurs Ruul seulement), dans la bienvenue, les relances Ruul
 * et l'étape 6 du dashboard. Tout est fait avant le premier post (dimanche minuit, heure de Paris).
 */
export function guideRuul(email: string | null, avant: string | null = "Sunday midnight (Paris time)"): string {
  return [
    "Set up Ruul — required to get paid (5 minutes)",
    ...(avant ? [`Do it before your first post: before ${avant}.`] : []),
    "",
    "1. Go to app.ruul.io/register",
    "2. Choose « Contractor » (not Business).",
    "3. First name + last name exactly as on your ID.",
    `   Email: use exactly ${email ?? "your Ruul email"} (the one in your dashboard).`,
    "   Tip: if it's a Gmail address, you can also click « Continue with Google ».",
    "4. Role: choose « Digital Creator ».",
    "5. Tick « I agree to the Terms of Use » → « Create account ».",
    "6. Enter the code Ruul sent to your email. Didn't get it after 1 minute? Click « Resend » and check your spam.",
    "7. Once inside Ruul: go to « Payment accounts » → « Add my ID » → follow the steps (ID + bank details).",
    "8. That's it. Nothing else to do on Ruul.",
    "",
    "How you get paid: every Monday, the money for the week you posted arrives in your Ruul space, then goes to your bank. Your first payment: the Monday after your first week.",
    "",
    "Problem with Ruul? Click Help in your dashboard.",
  ].join("\n");
}
const BOUTON_RUUL = { texte: "Open Ruul", lien: LIEN_RUUL };

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
  /** 0698 : la vérification d'identité lue dans Ruul (not_started | pending | approved | declined) et le nombre de refus. */
  identite?: string | null;
  identite_refus?: number;
}

export type TypeParcours =
  | "bienvenue" | "demain" | "report" | "desactivation" | "jamais_connecte" | "tiktok" | "warmup" | "slack" | "ruul" | "carte_ruul"
  // 13/11 (Réparer Ruul, v2) : les emails A/B passent par le même moteur ; la confirmation d'arrêt.
  | "invite_a" | "invite_b" | "arret"
  // Point 4 : la vérification d'identité Ruul refusée (1re fois : refaire ; 2e : fin de collaboration).
  | "identite_refusee" | "identite_fin"
  // 13/11 (Max) : le samedi, « Invited » qui a posté : finir Ruul avant lundi pour être payé cette semaine.
  | "samedi_ruul";

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
/**
 * 13/11 (Max) : les emails partent entre 9 h et 20 h (heure de Paris). Exceptions : « you start tomorrow »
 * (dimanche 20 h → minuit) et la carte « Ruul jamais fini » (pas un email).
 */
export function dansFenetre(maintenant: Date, type: TypeParcours): boolean {
  if (type === "carte_ruul" || type === "demain") return true;
  const h = partiesLocales(maintenant, PARIS).heure;
  return h >= 9 && h < 20;
}

export function prochainEnvoi(e: EtatParcours, maintenant: Date, o: { bienvenue: boolean; bienvenueDepuis?: string | null; v2?: boolean }): Decision | null {
  if (e.relances_stop_at || !e.email) return null;
  const t = maintenant.getTime();
  const p = partiesLocales(maintenant, PARIS);

  // La carte « Ruul jamais fini » n'est pas un email : elle passe même un jour où un email est parti.
  const ruul = etatRuul(e);
  // 13/11 (règle Ruul) : « Active » dans Ruul = payable le lundi : plus de relance « Ruul pas prêt ».
  const ruulEnCours = !ruulPret(e) && e.ruul_compte !== "active" && (!!e.ruul_email_a_at || !!e.ruul_email_b_at);
  if (ruulEnCours && ruul.n >= RUUL_MAX && ruul.depuis && t - new Date(ruul.depuis).getTime() >= 2 * JOUR && !envoye(e, "carte_ruul")) {
    return { type: "carte_ruul", cle: "carte_ruul" };
  }
  if (emailAujourdhui(e, maintenant)) return null;

  if (o.bienvenue && o.bienvenueDepuis && e.cree_at >= o.bienvenueDepuis && !envoye(e, "bienvenue")) {
    return { type: "bienvenue", cle: "bienvenue" };
  }
  // 0698 : identité refusée par Ruul. 2e refus : fin de collaboration (email poli, puis désactivation).
  if (o.v2 && e.identite === "declined") {
    if ((e.identite_refus ?? 0) >= 2 && !envoye(e, "identite_fin")) return { type: "identite_fin", cle: "identite_fin" };
    if ((e.identite_refus ?? 0) === 1 && !envoye(e, "identite_refus_1")) return { type: "identite_refusee", cle: "identite_refus_1" };
  }
  // v2 : l'email A (« Invited » dans Ruul) ou B (« Active »), une fois chacun, par ce moteur (plus par `envoyer`).
  if (o.v2 && !ruulPret(e)) {
    if (e.ruul_compte === "invited" && !e.ruul_email_a_at && !e.ruul_email_b_at) return { type: "invite_a", cle: "invite_a" };
    if (e.ruul_compte === "active" && !e.ruul_email_b_at) return { type: "invite_b", cle: "invite_b" };
  }
  // 13/11 (Max) : le samedi (Paris), un « Invited » qui a posté : une relance spéciale, une fois par samedi.
  if (o.v2 && e.ruul_compte === "invited" && e.posts > 0 && p.isoJour === 6) {
    const cle = `samedi_ruul:${p.date}`;
    if (!envoye(e, cle)) return { type: "samedi_ruul", cle };
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
  /** 13/11 : le statut du compte dans Ruul (invited | active) : le texte de la relance Ruul en dépend. */
  ruul_compte?: string | null;
  abonnements: number | null;
  /** report : le nouveau lundi. */
  lundi?: string;
  /** relance Ruul : son numéro (1 à 6). */
  numero?: number;
  /** report : ce qui est déjà fait (sa checklist personnelle). */
  faites?: { connexion: boolean; tiktok: boolean; warmup: boolean; slack: boolean };
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
          PHRASE_QUESTION_OS,
          guideRuul(d.ruul_email, avant),
        ].join("\n\n"),
        bouton: BOUTON_RUUL,
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
      // 13/11 (Max) : « Invited » dans Ruul : il s'inscrit lui-même sur app.ruul.io avec l'email exact.
      if (d.ruul_compte !== "active") {
        return {
          objet: "Reminder: create your Ruul account to get paid",
          corps: [bonjour(d), "Your Ruul account isn't ready yet, so we can't pay you.", guideRuul(d.ruul_email, avant),
            "You don't need Ruul to start posting — it's only to get paid. You're paid every Monday for the week you posted."].join("\n\n"),
          bouton: BOUTON_RUUL,
        };
      }
      return {
        objet: "Reminder: finish your Ruul account to get paid",
        corps: [bonjour(d),
          `Your Ruul account isn't ready yet, so we can't pay you. It takes about 10 minutes:\n1. Open the email from Ruul sent to ${d.ruul_email ?? "your email"} (check spam too).\n2. Create your account with that same email address, using your real name as on your ID.\n3. Verify your identity (ID + selfie).\n4. Add your bank account.\n5. Click the button below.`,
          "You're paid every Monday for the week you posted (Monday to Sunday)."].join("\n\n"),
        bouton: { texte: "It's done", lien: lienPret },
      };
    case "report": {
      const nouveau = d.lundi ? jourLundi(d.lundi) : "next Monday";
      const f = d.faites ?? { connexion: false, tiktok: false, warmup: false, slack: false };
      const etapes = [
        !f.connexion ? `Log in to your dashboard (${d.dashboard}).` : null,
        !f.tiktok ? `Create your TikTok account${d.handle ? ` with this exact name: @${d.handle}` : ""}.` : null,
        !f.warmup ? "Click « Start warmup » on your dashboard, follow at least 5 accounts and use TikTok normally." : null,
        !f.slack ? `Join Slack: ${d.slack}` : null,
      ].filter((x): x is string => !!x);
      return {
        objet: `You'll start on ${nouveau}`,
        corps: [bonjour(d),
          `Your setup wasn't finished by Sunday midnight, so you'll start one week later, on ${nouveau}.`,
          `Finish these steps before ${d.lundi ? echeance(d.lundi) : "next Sunday at midnight (Paris time)"}:\n${etapes.map((x, i) => `${i + 1}. ${x}`).join("\n") || "1. Log in to your dashboard and check your checklist."}`].join("\n\n"),
      };
    }
    case "demain":
      return {
        objet: "Reminder: you start posting tomorrow",
        corps: [bonjour(d), "You start posting tomorrow. Here's how it works:",
          "- Your posts are on your dashboard from Monday morning.\n- 2 slideshows a day, 7 days a week.\n- Keep at least 5 follows and keep using TikTok normally.\n- Paste the link of each post on your dashboard.\n- You're paid every Monday for the week you posted.",
          `Dashboard: ${d.dashboard}`].join("\n\n"),
      };
    case "invite_a":
      return {
        objet: "Create your Ruul account to get paid",
        corps: [bonjour(d),
          "We use Ruul to pay you. You don't need to wait for an email from Ruul: create your account now.",
          guideRuul(d.ruul_email, avant),
          `You start posting on ${debut}. Keep setting up your dashboard and TikTok meanwhile.`].join("\n\n"),
        bouton: BOUTON_RUUL,
      };
    case "samedi_ruul":
      return {
        objet: "Finish your Ruul account before Monday to be paid this week",
        corps: [bonjour(d),
          "Finish your Ruul account before Monday to be paid this week.",
          guideRuul(d.ruul_email, null),
          "If it's not done by Monday, your pay isn't lost: it's added to the next Monday once your account is ready."].join("\n\n"),
        bouton: BOUTON_RUUL,
      };
    case "invite_b":
      return {
        objet: "You're connected on Ruul: one last check to get paid",
        corps: [bonjour(d),
          "Your Ruul account is connected. Just make sure your ID is verified and your bank account is added, then click the button below.",
          "You're paid every Monday for the week you posted (Monday to Sunday)."].join("\n\n"),
        bouton: { texte: "It's done", lien: lienPret },
      };
    case "identite_refusee":
      return {
        objet: "Ruul couldn't verify your identity: please try again",
        corps: [bonjour(d),
          "Ruul couldn't verify your identity, so we can't pay you yet. Please try again in Ruul:",
          "1. Use a valid ID (passport, ID card or driving licence) that isn't expired.\n2. Take clear photos in good light, with the 4 corners of the ID visible.\n3. Make sure the name on your Ruul account is exactly the name on your ID.\n4. Take the selfie in good light, without glasses or a hat.\n5. Then click the button below.",
          "If it's declined a second time, we won't be able to pay you through Ruul."].join("\n\n"),
        bouton: { texte: "It's done", lien: lienPret },
      };
    case "identite_fin":
      return {
        objet: "About your work with Vik Studios",
        corps: [bonjour(d),
          "Ruul couldn't verify your identity a second time. We can only pay through Ruul, so unfortunately we have to end our collaboration. Your access is now closed.",
          "If you posted this week, that week is still paid on Monday. Thank you for your time with us, and we wish you all the best."].join("\n\n"),
      };
    case "arret":
      return {
        objet: "You've stopped working with Vik Studios",
        corps: [bonjour(d),
          "As you asked, your access is closed and you won't receive any more emails from us.",
          "If you posted this week, that week is still paid on Monday. Thank you for your time with us."].join("\n\n"),
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
  invite_a: "Ruul Invited",
  invite_b: "Ruul Active",
  samedi_ruul: "Ruul avant lundi (samedi)",
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
  // Réparer Ruul (point 6) : prêt = connecté + TikTok + warm-up lancé + 5 abonnements ; Slack et Ruul ne bloquent pas.
  const prets = d.etats.filter((e) => estPret(e)).length;
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
