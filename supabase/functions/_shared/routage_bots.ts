/**
 * 13/11 (Max) : « escalations → aux bots d'abord ». Chaque demande (support_demandes) et chaque
 * problème reçoit un bot responsable, selon sa catégorie :
 *   onboarding / contrat / compte → new_cohort_bot ; posts / warm-up / retard / STOP → control_bot ;
 *   paie / milestone / bonus → pay_bot ; invitation / email / identité Ruul → ruul_bot ;
 *   technique → os_tickets (le système d'Adrien, inchangé) ; fraude / litige → max.
 * « autre » : selon l'avancée du posteur (pas encore posté → new_cohort_bot, sinon control_bot).
 * Rien ici ne touche la base ni le réseau.
 */

export type Responsable = "new_cohort_bot" | "control_bot" | "pay_bot" | "ruul_bot" | "os_tickets" | "max";

export const RESPONSABLES: readonly Responsable[] = ["new_cohort_bot", "control_bot", "pay_bot", "ruul_bot", "os_tickets", "max"];

const PAR_CATEGORIE: Record<string, Responsable> = {
  // onboarding, contrat, compte
  connexion: "new_cohort_bot", login: "new_cohort_bot", compte: "new_cohort_bot", upwork: "new_cohort_bot", slack: "new_cohort_bot",
  onboarding: "new_cohort_bot", statut: "new_cohort_bot", contrat: "new_cohort_bot", bienvenue: "new_cohort_bot",
  // posts, warm-up, retard, STOP
  posting: "control_bot", posts: "control_bot", tiktok: "control_bot", warmup: "control_bot", retard: "control_bot", arret: "control_bot", stop: "control_bot",
  lien: "control_bot", pause: "control_bot",
  // paie, milestone, bonus
  paiement: "pay_bot", paie: "pay_bot", milestone: "pay_bot", bonus: "pay_bot", parrainage: "pay_bot",
  // Ruul : invitation, email, identité
  ruul: "ruul_bot", invitation_ruul: "ruul_bot", email_ruul: "ruul_bot", identite: "ruul_bot",
  // technique
  bug: "os_tickets", technique: "os_tickets",
  // fraude, litige
  fraude: "max", litige: "max", dispute: "max",
};

/** Les risques qui vont toujours chez Max (argent d'un tiers, multi-comptes, hors plateforme). */
const RISQUES_MAX = new Set(["argent_tiers", "multi_comptes", "hors_plateforme", "fraude", "litige"]);

export function botResponsable(o: {
  categorie: string | null | undefined;
  /** Les risques relevés par le bot (bot_support : RISQUES). */
  risques?: readonly string[] | null;
  /** Le niveau « max » décidé par le bot ou le verdict de paie. */
  niveau?: string | null;
  /** Le posteur a déjà publié au moins un post (sinon il est encore en onboarding). */
  aPoste?: boolean | null;
  /** Une demande Ruul (canal de paie) : un « compte » parle alors de Ruul. */
  ruul?: boolean | null;
}): Responsable {
  if (o.niveau === "max" || (o.risques ?? []).some((r) => RISQUES_MAX.has(r))) return "max";
  const c = (o.categorie ?? "").trim().toLowerCase();
  if (c === "compte" && o.ruul) return "ruul_bot";
  const r = PAR_CATEGORIE[c];
  if (r) return r;
  return o.aPoste ? "control_bot" : "new_cohort_bot";
}

/** Après 2 passages d'un bot sans qu'il ait réglé ni remonté, la demande part chez Max. */
export const PASSAGES_MAX = 2;

export function doitRemonter(o: { passages: number; regle_at: string | null; remonte_at: string | null }): boolean {
  return !o.regle_at && !o.remonte_at && o.passages >= PASSAGES_MAX;
}
