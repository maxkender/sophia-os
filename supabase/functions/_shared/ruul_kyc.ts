/**
 * 18/11 (Max) : la relance « finir son installation Ruul » (inscription, identité, banque, identité refusée).
 * Texte de base en anglais (traduit ensuite dans la langue du posteur), adapté à ce qui manque exactement.
 * Jamais « bot » ni « automatique ».
 */
export type ManqueRuul = "inscription" | "identite" | "banque" | "identite_refusee";

const FIN = "Then click \"It's done\" on your dashboard. If it's not done, this week can't be paid.";

export function texteKyc(manque: ManqueRuul, email: string): string {
  const e = email.trim();
  switch (manque) {
    case "inscription":
      return `To get paid on Monday, you need to finish your Ruul setup: create your account on app.ruul.io with ${e}, verify your identity and add your withdrawal method. ${FIN}`;
    case "banque":
      return `To get paid on Monday, you need to finish your Ruul setup: your identity is verified, now add your withdrawal method on app.ruul.io (use ${e}). ${FIN}`;
    case "identite_refusee":
      return `Your identity verification on Ruul was declined. To get paid on Monday, please verify your identity again on app.ruul.io (use ${e}) with a valid ID, and add your withdrawal method. ${FIN}`;
    default:
      return `To get paid on Monday, you need to finish your Ruul setup: verify your identity and add your withdrawal method on app.ruul.io (use ${e}). ${FIN}`;
  }
}

export const OBJET_KYC = "Finish your Ruul setup to get paid on Monday";

export function estManque(v: unknown): v is ManqueRuul {
  return v === "inscription" || v === "identite" || v === "banque" || v === "identite_refusee";
}
