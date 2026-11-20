/**
 * Prompt 22 : la section « Recruitment Automation » du menu admin. SOURCE
 * UNIQUE des 9 pages (lue par le menu, le routeur et les tests) et des
 * anciennes adresses, qui redirigent : aucun lien cassé.
 */

export type PageAuto = "aujourdhui" | "reglages" | "overview" | "recruits" | "cohorts" | "decisions" | "sent" | "received" | "needs" | "problems" | "disputes" | "payroll" | "paie_ruul" | "rapport_kills" | "bonus" | "candidats_ruul" | "cohortes_ruul" | "ruul_suivi" | "upwork_ajouter" | "faq" | "officielles" | "support" | "parrainage" | "slack" | "logs" | "cartes" | "qualite";

export const PAGES_AUTO: readonly { cle: PageAuto; to: string }[] = [
  // 12/11 (OS clair) : ce que Max doit faire maintenant, et toutes les anciennes pages rangées.
  { cle: "aujourdhui", to: "/admin/auto/aujourdhui" },
  { cle: "reglages", to: "/admin/auto/reglages" },
  { cle: "overview", to: "/admin/auto" },
  { cle: "recruits", to: "/admin/auto/recruits" },
  // Les tableaux de bord des cohortes (lecture seule) : la prochaine sera-t-elle prête, comment ont fait les passées.
  { cle: "cohorts", to: "/admin/auto/cohorts" },
  { cle: "decisions", to: "/admin/auto/decisions" },
  { cle: "sent", to: "/admin/auto/sent" },
  { cle: "received", to: "/admin/auto/received" },
  // Bloc C (2/11) : « Problems » remplace Needs you (un problème par posteur et par catégorie).
  // L'ancienne adresse redirige ici ; l'ancienne page reste ouverte pendant le test (/admin/auto/needs-you-ancien).
  { cle: "needs", to: "/admin/auto/problemes" },
  // 13/11 (Max) : l'ancienne page des cartes Problèmes (la page du menu est la page claire en 3 sections).
  { cle: "cartes", to: "/admin/auto/problemes-cartes" },
  // Seulement les alertes graves (messages bloqués, trop d'appels à l'API, panne), avec une piste de débogage.
  { cle: "problems", to: "/admin/auto/problems" },
  // Prompt 21, R : quand un posteur dit que l'OS s'est trompé (entre Messages received et Payroll).
  { cle: "disputes", to: "/admin/auto/disputes" },
  { cle: "payroll", to: "/admin/auto/payroll" },
  // 18/11 (Max) : la paie Ruul sur sa page : le lot de la semaine, payés / pas prêts / exclus, l'historique.
  { cle: "paie_ruul", to: "/admin/auto/paie-ruul" },
  // 18/11 (Max) : le rapport des kills du samedi et le contrôle de toute la base.
  { cle: "rapport_kills", to: "/admin/auto/rapport-kills" },
  // 8/11 : les bonus (Comment Masters, parrainage, manuels), à valider puis envoyés au clic.
  { cle: "bonus", to: "/admin/auto/bonus" },
  // 9/11 (0577) : les posteurs du site payés par Ruul, de la candidature à la 1re paie.
  { cle: "candidats_ruul", to: "/admin/auto/candidats-ruul" },
  { cle: "cohortes_ruul", to: "/admin/auto/cohortes-ruul" },
  // 10/11 : Ruul, les posteurs à ajouter dans Ruul (puis le suivi complet, partie 6).
  { cle: "ruul_suivi", to: "/admin/auto/ruul" },
  // 17/11 (Max) : les posteurs qui demandent à être payés par Upwork (exception), lien de profil vérifié par le support.
  { cle: "upwork_ajouter", to: "/admin/auto/upwork-a-ajouter" },
  { cle: "faq", to: "/admin/auto/faq" },
  // 6/11 : les réponses validées par Max, que le bot FAQ et les 3 bots donnent en priorité.
  { cle: "officielles", to: "/admin/auto/reponses-officielles" },
  // 11/11 (0671) : ce que demandent les posteurs (Help, Slack) : Problems et Questions, réponse en un clic.
  { cle: "support", to: "/admin/auto/support" },
  { cle: "parrainage", to: "/admin/auto/parrainage" },
  // 8/11 : les personnes désactivées dans l'OS encore membres actifs de Slack.
  { cle: "slack", to: "/admin/auto/retirer-slack" },
  { cle: "logs", to: "/admin/auto/logs" },
  // 21/11 (Max, point 10) : le rapport qualité du support (le DM du lundi en est le résumé).
  { cle: "qualite", to: "/admin/auto/qualite" },
];

export const cheminAuto = (cle: PageAuto): string => PAGES_AUTO.find((p) => p.cle === cle)!.to;

/**
 * 5/11 : Weekly decisions est LA page où Max décide (jeudi, samedi, dimanche,
 * « À décider maintenant ») ; Problèmes est le quotidien. System alerts et
 * Disputes restent hors du menu ; leurs adresses restent ouvertes (rien n'est supprimé).
 */
export const HORS_MENU: readonly PageAuto[] = ["problems", "disputes"];

/**
 * 21/11 (Max, point 7) : le menu admin en 7 groupes : Aujourd'hui · Posteurs · Contenu · Paie · Recrutement · Santé ·
 * Réglages. Ici, les pages de l'automatisation et leur groupe ; les autres liens (Contenu, Santé…) sont dans
 * AdminLayout. « Problèmes », « Pays » et « File de relecture » sortent du menu : leurs adresses restent ouvertes.
 */
export type GroupeMenu = "aujourdhui" | "posteurs" | "contenu" | "paie" | "recrutement" | "sante" | "reglages";
export const GROUPES_MENU: readonly GroupeMenu[] = ["aujourdhui", "posteurs", "contenu", "paie", "recrutement", "sante", "reglages"];

export type EntreeMenuAuto = "aujourdhui" | "support" | "decisions" | "qualite" | "posteurs" | "ruul" | "upwork" | "rapport_kills" | "paie" | "paie_ruul" | "cohortes" | "candidats" | "reglages";
export const MENU_AUTO: readonly { cle: EntreeMenuAuto; to: string; page: PageAuto; groupe: GroupeMenu }[] = [
  { cle: "aujourdhui", to: "/admin/auto/aujourdhui", page: "aujourdhui", groupe: "aujourdhui" },
  { cle: "support", to: "/admin/auto/support", page: "support", groupe: "aujourdhui" },
  { cle: "decisions", to: "/admin/auto/decisions", page: "decisions", groupe: "aujourdhui" },
  { cle: "qualite", to: "/admin/auto/qualite", page: "qualite", groupe: "aujourdhui" },
  { cle: "posteurs", to: "/admin/auto/recruits", page: "recruits", groupe: "posteurs" },
  { cle: "ruul", to: "/admin/auto/ruul", page: "ruul_suivi", groupe: "posteurs" },
  { cle: "upwork", to: "/admin/auto/upwork-a-ajouter", page: "upwork_ajouter", groupe: "posteurs" },
  { cle: "rapport_kills", to: "/admin/auto/rapport-kills", page: "rapport_kills", groupe: "posteurs" },
  { cle: "paie", to: "/admin/auto/payroll", page: "payroll", groupe: "paie" },
  { cle: "paie_ruul", to: "/admin/auto/paie-ruul", page: "paie_ruul", groupe: "paie" },
  { cle: "cohortes", to: "/admin/auto/cohorts", page: "cohorts", groupe: "recrutement" },
  { cle: "candidats", to: "/admin/auto/candidats-ruul", page: "candidats_ruul", groupe: "recrutement" },
  { cle: "reglages", to: "/admin/auto/reglages", page: "reglages", groupe: "reglages" },
];

/** Les pages hors du menu, rangées dans Réglages (dans cet ordre). */
export const ANCIENNES_PAGES: readonly PageAuto[] = PAGES_AUTO
  .map((p) => p.cle)
  .filter((c) => !MENU_AUTO.some((m) => m.page === c));

/** 12/11 (OS clair) : l'arrivée de l'admin, « Aujourd'hui ». */
export const ACCUEIL_ADMIN = "/admin/auto/aujourdhui";

/**
 * Les anciennes adresses → les nouvelles (les pages retirées du menu et du
 * code). Reviews renvoie vers Disputed feedback : la table des retours reste.
 */
export const ANCIENNES_ADRESSES: Readonly<Record<string, string>> = {
  "/admin/pipeline": "/admin/auto/recruits",
  "/admin/cohortes": "/admin/auto/recruits",
  "/admin/recrutements": "/admin/auto/recruits",
  "/admin/recrutements/:pays": "/admin/auto/recruits",
  "/admin/check-kill-double": "/admin/auto/decisions",
  "/admin/inactifs": "/admin/auto/decisions",
  "/admin/nudges": "/admin/auto/sent",
  "/admin/reponses": "/admin/auto/received",
  "/admin/paie": "/admin/auto/payroll",
  "/admin/assistant": "/admin/auto/faq",
  // Prompt 21, R : Disputed feedback devient l'onglet « Feedback » de Disputes.
  // 31/10 : le feedback a sa page dans Tracking.
  "/admin/reviews": "/admin/quality-feedback",
  "/admin/retours-contestes": "/admin/quality-feedback",
  "/admin/surveillance": "/admin/auto",
  // Bloc C (2/11) : Needs you devient Problems ; 21/11 (Max) : tout arrive sur « Aujourd'hui ».
  "/admin/auto/needs-you": "/admin/auto/aujourdhui",
};
