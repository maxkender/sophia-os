/**
 * Prompt 22 : la section « Recruitment Automation » du menu admin. SOURCE
 * UNIQUE des 9 pages (lue par le menu, le routeur et les tests) et des
 * anciennes adresses, qui redirigent : aucun lien cassé.
 */

export type PageAuto = "overview" | "recruits" | "decisions" | "sent" | "received" | "needs" | "payroll" | "faq" | "logs";

export const PAGES_AUTO: readonly { cle: PageAuto; to: string }[] = [
  { cle: "overview", to: "/admin/auto" },
  { cle: "recruits", to: "/admin/auto/recruits" },
  { cle: "decisions", to: "/admin/auto/decisions" },
  { cle: "sent", to: "/admin/auto/sent" },
  { cle: "received", to: "/admin/auto/received" },
  // Prompt 21, U : tout ce que l'OS n'a pas pu faire, ou dont il n'est pas sûr (juste avant Disputes).
  { cle: "needs", to: "/admin/auto/needs-you" },
  { cle: "payroll", to: "/admin/auto/payroll" },
  { cle: "faq", to: "/admin/auto/faq" },
  { cle: "logs", to: "/admin/auto/logs" },
];

export const cheminAuto = (cle: PageAuto): string => PAGES_AUTO.find((p) => p.cle === cle)!.to;

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
  "/admin/reviews": "/admin/retours-contestes",
  "/admin/surveillance": "/admin/auto",
};
