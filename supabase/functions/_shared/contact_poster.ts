/**
 * Les liens et l'email d'un poster saisis à sa création (0358) : profil
 * Upwork, contrat Upwork, email personnel (celui de Slack).
 *
 * Seuls les champs envoyés et non vides sont repris : un appel qui n'en parle
 * pas (recruteur, guichet, ancien front) ne touche à rien. Un email illisible
 * est refusé AVANT la création du login, pour ne pas laisser de compte à moitié
 * rempli. Le même contrôle vit dans la contrainte `profiles_email_perso_format`.
 */

export interface ContactPoster {
  upwork_url: string | null;
  upwork_contrat_url: string | null;
  email_perso: string | null;
}

export const FORMAT_EMAIL_PERSO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CHAMPS = ["upwork_url", "upwork_contrat_url", "email_perso"] as const;

export function lireContactPoster(
  body: Record<string, unknown>,
): { ok: true; contact: Partial<ContactPoster> } | { ok: false; erreur: string } {
  const contact: Partial<ContactPoster> = {};
  for (const champ of CHAMPS) {
    const valeur = String(body[champ] ?? "").trim();
    if (valeur) contact[champ] = valeur;
  }
  if (contact.email_perso) {
    contact.email_perso = contact.email_perso.toLowerCase();
    if (!FORMAT_EMAIL_PERSO.test(contact.email_perso)) return { ok: false, erreur: "EMAIL_PERSO_INVALIDE" };
  }
  return { ok: true, contact };
}
