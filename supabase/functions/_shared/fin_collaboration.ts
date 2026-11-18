/**
 * 18/11 (Max) : ce que le posteur lit quand sa collaboration s'arrête ou qu'un de ses comptes est désactivé.
 * UNE source pour la page « collaboration terminée », le bandeau du dashboard, le message de fin et les bots
 * (Help, Slack) : les mêmes phrases, en anglais ici, traduites ensuite dans la langue du posteur.
 * Jamais de code interne (ckd:absent…) : les raisons connues ont leur phrase, les autres passent par `raisonEnClair`.
 */
import { dateCourte, type EtatReel, lundiDePaie, situation } from "./support_regles.ts";

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
    ? `From next week, your payment is ${p.montant} $ per week (1 account).`
    : "From next week, you are paid for 1 account.";
  return `One of your accounts (${compte}) was deactivated on ${dateCourte(p.le)} because ${raison}. ${autre} ${paie}`;
}

/** L'objet du message de fin. */
export const OBJET_FIN = "Your collaboration with Vik Studios";
