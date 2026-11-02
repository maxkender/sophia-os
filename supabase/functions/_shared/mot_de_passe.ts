/**
 * 31/10 : un mot de passe par recrue (plus 12345678 pour tout le monde : les
 * emails se devinent). 8 caractères faciles à taper : 4 lettres qui se
 * prononcent (consonne, voyelle) puis 4 chiffres, sans l, i, o, 0, 1. La
 * recrue le change à sa 1re connexion (must_change_password).
 */
const CONSONNES = "bcdfghjkmnprstvwz";
const VOYELLES = "aeuy";
const CHIFFRES = "23456789";

/** L'ancien mot de passe commun : remplacé par un mot de passe unique. */
export const MOT_DE_PASSE_COMMUN = "12345678";

export function motDePasseRecrue(aleatoire: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0]! % n): string {
  const pris = (s: string) => s[aleatoire(s.length)]!;
  return `${pris(CONSONNES)}${pris(VOYELLES)}${pris(CONSONNES)}${pris(VOYELLES)}${pris(CHIFFRES)}${pris(CHIFFRES)}${pris(CHIFFRES)}${pris(CHIFFRES)}`;
}

/** Le mot de passe d'une création de posteur : unique si rien n'est donné, « auto », ou l'ancien commun. */
export function motDePasseCreation(demande: string | null | undefined): string {
  const d = String(demande ?? "").trim();
  return !d || d === "auto" || d === MOT_DE_PASSE_COMMUN ? motDePasseRecrue() : d;
}
