/**
 * 7/11 : l'offre d'un 2ᵉ compte. Texte décidé par Max, en anglais, traduit
 * dans la langue d'affichage du posteur (fr). Le montant : tarif de la
 * semaine → tarif × 2.
 */
export interface TextesDouble {
  titre: string;
  texte: (tarif: number | null) => string;
  oui: string;
  non: string;
  plusTard: string;
  jusqua: (date: string) => string;
  confirmation: (handle: string | null) => string;
  refus: string;
  fermer: string;
  erreur: string;
}

const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export const TEXTES_DOUBLE: Record<"en" | "fr", TextesDouble> = {
  en: {
    titre: "🎉 You've been selected for a second account",
    texte: (tarif) =>
      "Your work these past weeks has been great. Would you like to manage a second TikTok account? Same work (2 posts a day on it too), and your weekly pay goes from "
      + (tarif ? `${dollars(tarif)} to ${dollars(tarif * 2)}.` : "one account's rate to twice that."),
    oui: "Yes, I'm in",
    non: "No thanks, keep one account",
    plusTard: "I'll decide later",
    jusqua: (date) => `Answer before ${date}.`,
    confirmation: (handle) =>
      `Great! Your second account${handle ? ` @${handle}` : ""} is on your dashboard. Create it on TikTok, do the warm-up, and you'll start posting on it the day after.`,
    refus: "No problem at all, keep up the great work! 🙂",
    fermer: "Close",
    erreur: "Something went wrong. Please try again.",
  },
  fr: {
    titre: "🎉 Tu as été sélectionné(e) pour un 2ᵉ compte",
    texte: (tarif) =>
      "Ton travail ces dernières semaines est excellent. Veux-tu gérer un 2ᵉ compte TikTok ? Le même travail (2 posts par jour dessus aussi), et ta paie de la semaine passe de "
      + (tarif ? `${dollars(tarif)} à ${dollars(tarif * 2)}.` : "un tarif à deux fois ce tarif."),
    oui: "Oui, je suis partant(e)",
    non: "Non merci, je garde un compte",
    plusTard: "Je déciderai plus tard",
    jusqua: (date) => `Réponds avant ${date}.`,
    confirmation: (handle) =>
      `Super ! Ton 2ᵉ compte${handle ? ` @${handle}` : ""} est sur ton tableau de bord. Crée-le sur TikTok, fais le warm-up, et tu commences à poster dessus le lendemain.`,
    refus: "Aucun problème, continue comme ça ! 🙂",
    fermer: "Fermer",
    erreur: "Un problème est survenu. Réessaie.",
  },
};

export const textesDouble = (langue: string | undefined): TextesDouble => (langue?.startsWith("fr") ? TEXTES_DOUBLE.fr : TEXTES_DOUBLE.en);
