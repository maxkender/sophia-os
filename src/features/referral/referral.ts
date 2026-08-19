import { estPaysOs } from "@/features/moteur/langues";

export const BONUS_PAR_RECRUE_USD = 10;
export const POSTS_POUR_BONUS = 5;

export const STATUTS_REFERRAL = ["en_attente", "accepte", "refuse"] as const;
export type StatutReferral = (typeof STATUTS_REFERRAL)[number];

export type ReferralPayload = {
  prenom: string;
  nom?: string;
  pays: string;
  contact_upwork?: string;
  contact_email?: string;
  contact_telephone?: string;
  confirme_present: boolean;
  confirme_fiable: boolean;
  confirme_majeur: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function bonusPotentielUsd(nbRecruesEligibles: number): number {
  if (!Number.isFinite(nbRecruesEligibles) || nbRecruesEligibles <= 0) return 0;
  return Math.floor(nbRecruesEligibles) * BONUS_PAR_RECRUE_USD;
}

export function texteOuNull(valeur: string | undefined | null): string | null {
  const trim = (valeur ?? "").trim();
  return trim.length > 0 ? trim : null;
}

function digitsTelephone(valeur: string): string {
  return valeur.replace(/\D/g, "");
}

function contactUpworkValide(valeur: string): boolean {
  const v = valeur.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (/^www\./i.test(v)) return true;
  return /upwork\.com/i.test(v);
}

/** Clé i18n d'erreur, ou null si le formulaire est prêt à envoyer. */
export function validerReferral(payload: ReferralPayload): string | null {
  if (!texteOuNull(payload.prenom)) return "referral.err.prenom";
  if (!estPaysOs(payload.pays)) return "referral.err.pays";

  const upwork = texteOuNull(payload.contact_upwork);
  const email = texteOuNull(payload.contact_email);
  const telephone = texteOuNull(payload.contact_telephone);
  if (!email) return "referral.err.contact";
  if (!EMAIL_RE.test(email)) return "referral.err.email";

  if (upwork && !contactUpworkValide(upwork)) return "referral.err.upwork";
  if (telephone && digitsTelephone(telephone).length < 8) return "referral.err.telephone";

  if (!payload.confirme_present) return "referral.err.present";
  if (!payload.confirme_fiable) return "referral.err.fiable";
  if (!payload.confirme_majeur) return "referral.err.majeur";
  return null;
}
