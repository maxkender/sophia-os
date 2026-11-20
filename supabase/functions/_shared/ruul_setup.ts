/**
 * 21/11 (Max) : le bloc « Get paid » en haut du dashboard d'un posteur RUUL, tant qu'il n'est pas prêt, dans sa langue.
 * Les textes anglais (la source), traduits pour le posteur (traduction_email.ts, gardée en cache).
 */
export const TEXTES_SETUP_EN = {
  titre: "To get paid on Monday, finish your Ruul setup:",
  inscrit: "Sign up on app.ruul.io with {email}",
  identite: "Verify your identity",
  banque: "Add your bank account",
  limite: "Ready before Sunday 23:59 (Paris) = paid on Monday.",
  probleme: "I have a problem with Ruul",
  pret: "✅ You're all set, you'll be paid every Monday via Ruul.",
  ouvrir: "Open Ruul",
  fait: "Done",
} as const;

export type CleSetup = keyof typeof TEXTES_SETUP_EN;
export type EtapeSetup = "inscrit" | "identite" | "banque";
export const ETAPES_SETUP: EtapeSetup[] = ["inscrit", "identite", "banque"];

export interface EtatSetup {
  inscrit: boolean;
  identite: boolean;
  banque: boolean;
  pret: boolean;
}

/** La première étape qui manque (null : prêt). */
export function etapeManquante(e: EtatSetup): EtapeSetup | null {
  if (e.pret) return null;
  return ETAPES_SETUP.find((s) => !e[s]) ?? "banque";
}
