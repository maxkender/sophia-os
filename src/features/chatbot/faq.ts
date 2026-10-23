/**
 * FAQ automatique, côté admin (docs/faq-automatique.md).
 *
 * Copie de la lecture des réglages de supabase/functions/_shared/faq.ts —
 * garder les deux alignés : une valeur inconnue retombe en test, jamais en actif.
 */

export type ModeSlack = "eteint" | "test" | "actif";
export type ModeOs = "test" | "actif";

export type EtatFaq =
  | "repondu"
  | "bug"
  | "hors_sujet"
  | "a_valider"
  | "a_traiter"
  | "relance"
  | "traite_admin"
  | "traite_slack"
  | "ignore";

export interface ReglagesFaq {
  mode_slack: ModeSlack;
  mode_os: ModeOs;
  canaux_slack: string[];
  message_attente: boolean;
}

export const REGLAGES_FAQ_DEFAUT: ReglagesFaq = {
  mode_slack: "test",
  mode_os: "test",
  canaux_slack: ["C0BL56RJH7T"],
  message_attente: true,
};

/** Noms lisibles des canaux connus ; un autre s'affiche par son ID. */
export const NOMS_CANAUX: Readonly<Record<string, string>> = {
  C0BL56RJH7T: "#questions",
  C0BL0084Y3F: "#managers-hq",
};

export function lireReglagesFaq(valeur: unknown): ReglagesFaq {
  const v = (valeur && typeof valeur === "object" ? valeur : {}) as Record<string, unknown>;
  const modeSlack: ModeSlack = v.mode_slack === "eteint" || v.mode_slack === "actif" ? v.mode_slack : "test";
  const modeOs: ModeOs = v.mode_os === "actif" ? "actif" : "test";
  const canaux = Array.isArray(v.canaux_slack)
    ? v.canaux_slack.map((c) => String(c ?? "").trim()).filter((c) => /^[CG][A-Z0-9]{6,}$/.test(c))
    : REGLAGES_FAQ_DEFAUT.canaux_slack;
  return {
    mode_slack: modeSlack,
    mode_os: modeOs,
    canaux_slack: canaux,
    message_attente: v.message_attente === undefined ? true : Boolean(v.message_attente),
  };
}

export function lienSlack(canal: string, ts: string): string {
  return `https://sophia-system.slack.com/archives/${canal}/p${ts.replace(".", "")}`;
}

export const VARIANTE_ETAT: Record<EtatFaq, "success" | "info" | "warning" | "error" | "secondary" | "outline"> = {
  repondu: "success",
  bug: "info",
  hors_sujet: "outline",
  a_valider: "warning",
  a_traiter: "warning",
  relance: "error",
  traite_admin: "secondary",
  traite_slack: "secondary",
  ignore: "outline",
};

export const FILTRES_JOURNAL = ["tous", "repondu", "bug", "a_traiter", "hors_sujet", "traite"] as const;
export type FiltreJournal = (typeof FILTRES_JOURNAL)[number];

export function dansFiltre(etat: EtatFaq | null, filtre: FiltreJournal): boolean {
  if (filtre === "tous") return true;
  if (filtre === "a_traiter") return etat === "a_valider" || etat === "a_traiter" || etat === "relance";
  if (filtre === "traite") return etat === "traite_admin" || etat === "traite_slack" || etat === "ignore";
  return etat === filtre;
}

/** Le nombre de lignes du journal derrière chaque filtre (les pastilles). */
export function compterDecisions(etats: Array<EtatFaq | null>): Record<FiltreJournal, number> {
  const compte = Object.fromEntries(FILTRES_JOURNAL.map((f) => [f, 0])) as Record<FiltreJournal, number>;
  for (const e of etats) {
    for (const f of FILTRES_JOURNAL) if (dansFiltre(e, f)) compte[f] += 1;
  }
  return compte;
}
