// 25/11 (test persona) : le formulaire en cours est gardé dans l'onglet (sessionStorage) et rendu au retour (bouton
// « retour », lien ouvert, rechargement). Effacé une fois la candidature envoyée, ou à la déconnexion.

export type Champs = { prenom: string; nom: string; email: string; indicatif: string; tel: string; pays: string; parrain: string };
export type Cases = { tarif: boolean; engagement: boolean; consentement: boolean; whatsapp: boolean };

export interface Brouillon {
  v: Champs;
  majeur: boolean | null;
  entendu: string;
  cases: Cases;
  indicatifManuel: boolean;
}

const CLE_BROUILLON = "join_brouillon";

export function lireBrouillon(): Brouillon | null {
  try {
    const b = JSON.parse(sessionStorage.getItem(CLE_BROUILLON) ?? "null") as Brouillon | null;
    return b && typeof b === "object" && b.v ? b : null;
  } catch {
    return null;
  }
}

export function garderBrouillon(b: Brouillon): void {
  try {
    sessionStorage.setItem(CLE_BROUILLON, JSON.stringify(b));
  } catch {
    // stockage indisponible : le brouillon n'est pas gardé
  }
}

export function effacerBrouillon(): void {
  try {
    sessionStorage.removeItem(CLE_BROUILLON);
  } catch {
    // stockage indisponible
  }
}
