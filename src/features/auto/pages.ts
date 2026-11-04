/**
 * Prompt 22 : la section « Recruitment Automation » du menu admin. SOURCE
 * UNIQUE des 9 pages (lue par le menu, le routeur et les tests) et des
 * anciennes adresses, qui redirigent : aucun lien cassé.
 */

export type PageAuto = "overview" | "recruits" | "cohorts" | "decisions" | "sent" | "received" | "needs" | "problems" | "disputes" | "payroll" | "faq" | "logs";

export const PAGES_AUTO: readonly { cle: PageAuto; to: string }[] = [
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
  // Seulement les alertes graves (messages bloqués, trop d'appels à l'API, panne), avec une piste de débogage.
  { cle: "problems", to: "/admin/auto/problems" },
  // Prompt 21, R : quand un posteur dit que l'OS s'est trompé (entre Messages received et Payroll).
  { cle: "disputes", to: "/admin/auto/disputes" },
  { cle: "payroll", to: "/admin/auto/payroll" },
  { cle: "faq", to: "/admin/auto/faq" },
  { cle: "logs", to: "/admin/auto/logs" },
];

export const cheminAuto = (cle: PageAuto): string => PAGES_AUTO.find((p) => p.cle === cle)!.to;

/**
 * 4/11 : la page Problèmes est le SEUL endroit où Max décide. Weekly decisions
 * (jeudi, samedi, dimanche), System alerts et Disputes sortent du menu : leurs
 * cas deviennent des cartes, et les écrans du jeudi, du samedi et du dimanche
 * sont dans Problèmes → 📅 Samedi. Les adresses restent ouvertes (rien n'est supprimé).
 */
export const HORS_MENU: readonly PageAuto[] = ["decisions", "problems", "disputes"];

/** L'arrivée de l'admin : Overview. */
export const ACCUEIL_ADMIN = "/admin/auto";

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
  // Bloc C (2/11) : Needs you devient Problems.
  "/admin/auto/needs-you": "/admin/auto/problemes",
};
