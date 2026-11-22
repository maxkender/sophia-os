/**
 * 18/11 (Max) : ce que le posteur lit quand sa collaboration s'arrête ou qu'un de ses comptes est désactivé.
 * UNE source pour la page « collaboration terminée », le bandeau du dashboard, le message de fin et les bots
 * (Help, Slack) : les mêmes phrases, en anglais ici, traduites ensuite dans la langue du posteur.
 * Jamais de code interne (ckd:absent…) : les raisons connues ont leur phrase, les autres passent par `raisonEnClair`.
 */
import { dateCourte, type EtatReel, lundiDePaie, situation } from "./support_regles.ts";
import { PAIE_RUUL_DEUX_COMPTES } from "./doublement.ts";

export type CasFin = "kill" | "demande";

/** Les raisons internes connues, en clair (elles suivent « because »). */
const RAISONS: { motif: RegExp; texte: string }[] = [
  { motif: /^ckd:(absent|jeudi)$/i, texte: "posts were missing" },
  { motif: /^ckd:premiere_semaine$/i, texte: "the first week of posts was not completed" },
  { motif: /^ckd:inactif$/i, texte: "there was no activity on the account" },
  { motif: /^ckd:(vues|mauvaises_vues|anciens|mort)/i, texte: "the account wasn't getting views" },
  { motif: /stop jamais post|never posted/i, texte: "no post was ever published" },
  { motif: /sans aucune activit|no activity/i, texte: "there was no activity for 14 days" },
];

/** La raison connue en clair, ou null (le serveur la reformule alors sans code interne). */
export function raisonFixe(motif: string | null | undefined): string | null {
  const m = (motif ?? "").trim();
  if (!m) return null;
  return RAISONS.find((r) => r.motif.test(m))?.texte ?? null;
}

/** Arrêt demandé par le posteur (bouton, message, ou contrat terminé de son côté sur Upwork). */
export function estDemandePosteur(source: string | null | undefined, motif: string | null | undefined): boolean {
  return source === "je_ne_veux_plus" || /ended by freelancer|arrêté par le posteur|at your request|demande du posteur/i.test(motif ?? "");
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** La ligne « Payment: … » : ce qui reste dû, quand et par où ; sinon déjà payé ; sinon rien à payer. */
export function lignePaiement(e: EtatReel): string {
  const s = situation(e);
  const par = e.canal_paie === "ruul" ? "Ruul" : "Upwork";
  if (s.a_payer.length) {
    const total = s.a_payer.reduce((t, p) => t + p.montant, 0);
    const semaines = s.a_payer.map((p) => `the week of ${dateCourte(p.semaine)}`).join(" and ");
    const lundi = lundiDePaie(s.a_payer[s.a_payer.length - 1]!.semaine);
    return `${total} $ for ${semaines}, paid on Monday ${dateCourte(lundi)} via ${par}.`;
  }
  return e.paie.some((p) => p.paye_at) ? "your last week has already been paid." : "there is no payment due for your last weeks.";
}

/** La page « collaboration terminée » (et le message de fin, mot pour mot). */
export function texteFin(e: EtatReel, cas: CasFin, le: string, raison: string | null): string {
  const paiement = `Payment: ${lignePaiement(e)}`;
  const fin = "You no longer need to post. Thank you for your work.";
  if (cas === "demande") return [`Your contract ended at your request on ${dateCourte(le)}.`, paiement, fin].join("\n");
  return [
    `Your collaboration with Vik Studios ended on ${dateCourte(le)}.`,
    `Reason: ${majuscule((raison ?? "the collaboration did not continue").replace(/[.\s]+$/, ""))}.`,
    paiement,
    fin,
  ].join("\n");
}

/** Le bandeau « un de vos comptes a été désactivé » (posteur à 2 comptes, l'autre continue). */
export function texteCompteArrete(p: { handle: string | null; le: string; raison: string | null; autre: string | null; montant: number | null }): string {
  const compte = p.handle ? `@${p.handle.replace(/^@/, "")}` : "one account";
  const raison = (p.raison ?? "posts were missing").replace(/[.\s]+$/, "");
  const autre = p.autre ? `You keep posting on @${p.autre.replace(/^@/, "")} as usual.` : "You keep posting on your other account as usual.";
  const paie = p.montant && p.montant > 0
    ? `From next week, your weekly payment goes back to the 1-account rate: ${p.montant} $ per week.`
    : "From next week, you are paid for 1 account.";
  return `One of your accounts (${compte}) was deactivated on ${dateCourte(p.le)} because ${raison}. ${autre} ${paie}`;
}

/**
 * 19/11 (Max) : le bandeau du posteur dont Max a validé le 2e compte le jeudi : quel compte, quel label, quand il
 * démarre (le lundi, après son warm-up du jeudi au dimanche) et ce qu'il gagne en plus (tarif d'un compte par semaine).
 */
export function texteDeuxiemeCompte(p: {
  handle: string | null; label: string | null; lundi: string; tarif: number | null; canal?: string | null;
}): string {
  const compte = p.handle ? `@${p.handle.replace(/^@/, "")}` : "your account";
  const style = p.label ? ` in the "${p.label}" style` : "";
  const jour = dateCourte(`${p.lundi}T12:00:00Z`);
  const gain = p.tarif && p.tarif > 0
    ? `From that week you are paid for 2 accounts: +${p.tarif} $ per week (${2 * p.tarif} $ per week in total).`
    : "From that week you are paid for 2 accounts.";
  return `Good news: ${compte} is doing great, so you get a 2nd TikTok account${style}. It is on your dashboard now: ` +
    `create it and do its warm-up from today to Sunday. It starts posting on Monday ${jour}. ${gain}` +
    (p.canal === "ruul" ? ` ${PAIE_RUUL_DEUX_COMPTES}` : "");
}

/** L'objet du message de fin. */
export const OBJET_FIN = "Your collaboration with Vik Studios";
