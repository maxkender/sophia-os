/** Cadre Recrutements Sophia — constantes métier (pas de secrets). */

export const SLACK_INVITE_SOPHIA =
  "https://join.slack.com/t/sophia-system/shared_invite/zt-44pqj3z39-X4KkPQI6cwOwWE2LNaLbig";

export const OS_URL = "https://sophia-marketing-orga.vercel.app";

export const EMAIL_DOMAINE_OS = "sophia.com";

export const MDP_OS_INITIAL = "12345678";

export const TARIF_HM_HORAIRE_USD = 8;

export const TARIF_CREATEUR_MOIS_USD = 60;

export const TARIF_CREATEUR_ESSAI_USD = 15;

/** Objectif créateurs d’un HM dans un pays. L’admin peut le régler 0–30. */
export const CIBLE_CREATEURS_HM_DEFAUT = 10;
export const CIBLE_CREATEURS_HM_MIN = 0;
export const CIBLE_CREATEURS_HM_MAX = 30;

export function bornerCibleCreateurs(n: number): number {
  if (!Number.isFinite(n)) return CIBLE_CREATEURS_HM_DEFAUT;
  return Math.min(CIBLE_CREATEURS_HM_MAX, Math.max(CIBLE_CREATEURS_HM_MIN, Math.round(n)));
}

/** Flag volume si posts publiés / passages prévus < ce seuil. */
export const SEUIL_RATIO_POSTS = 0.75;

export const JOURS_STATS = 10;

export const TZ_STATS = "Europe/Paris";

export const UPWORK_ORG_VIK = "2074065383597823773";

/** Aligné sur `manage-users` : prenom + 1re lettre du nom, sans accents. */
export function normaliserIdentifiantOs(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** `{prenom}{1re lettre nom}@sophia.com` — collision gérée par manage-users. */
export function baseEmailOs(prenom: string, nom: string): string {
  const p = normaliserIdentifiantOs(prenom);
  const n = normaliserIdentifiantOs(nom).slice(0, 1);
  return `${p}${n}@${EMAIL_DOMAINE_OS}`;
}

export function messageAccesOs(opts: {
  prenom: string;
  email: string;
  fr: boolean;
}): string {
  if (opts.fr) {
    return [
      `Salut ${opts.prenom},`,
      "",
      "Voici tes accès Sophia OS :",
      `URL : ${OS_URL}`,
      `Email : ${opts.email}`,
      `Mot de passe : ${MDP_OS_INITIAL}`,
      "",
      `Rejoins aussi Slack : ${SLACK_INVITE_SOPHIA}`,
      "",
      "Et envoie-moi ton email perso (Gmail etc.) pour que je t'ajoute à l'équipe Upwork.",
    ].join("\n");
  }
  return [
    `Hi ${opts.prenom},`,
    "",
    "Here are your Sophia OS credentials:",
    `URL: ${OS_URL}`,
    `Email: ${opts.email}`,
    `Password: ${MDP_OS_INITIAL}`,
    "",
    `Please join Slack as well: ${SLACK_INVITE_SOPHIA}`,
    "",
    "And send me your personal email (Gmail, etc.) so I can add you to the Upwork team.",
  ].join("\n");
}

/** Emails / prénoms de test à exclure du pipeline. */
export function estCompteTestRecrutement(input: {
  email?: string | null;
  prenom?: string | null;
}): boolean {
  const email = (input.email ?? "").trim().toLowerCase();
  const prenom = (input.prenom ?? "").trim().toLowerCase();
  return email.startsWith("testt") || prenom === "testt" || email === "aa@sophia.com";
}

export const PASTEL_PAYS: Record<string, string> = {
  fr: "bg-rose-50/90 hover:bg-rose-50",
  en: "bg-sky-50/90 hover:bg-sky-50",
  de: "bg-amber-50/90 hover:bg-amber-50",
  it: "bg-emerald-50/90 hover:bg-emerald-50",
  es: "bg-orange-50/90 hover:bg-orange-50",
  pt: "bg-teal-50/90 hover:bg-teal-50",
  cs: "bg-violet-50/90 hover:bg-violet-50",
  nl: "bg-orange-50/80 hover:bg-orange-50",
  el: "bg-cyan-50/90 hover:bg-cyan-50",
  hu: "bg-lime-50/90 hover:bg-lime-50",
  pl: "bg-red-50/80 hover:bg-red-50",
  ro: "bg-yellow-50/90 hover:bg-yellow-50",
  sv: "bg-blue-50/90 hover:bg-blue-50",
  tr: "bg-red-50/70 hover:bg-red-50",
};
