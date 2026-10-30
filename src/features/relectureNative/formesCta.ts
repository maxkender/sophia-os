/**
 * Les formes de CTA (étape 4 de la réécriture native, docs/cta.md). Copie de
 * supabase/functions/_shared/formes_cta.ts : le test `formesCta.test.ts`
 * vérifie que les deux listes restent identiques.
 */

export interface FormeCta {
  code: string;
  nom: string;
  definition: string;
  exemple: string;
}

/** Les 7 formes, dans l'ordre de priorité du classement. */
export const FORMES_CTA: ReadonlyArray<FormeCta> = [
  {
    code: "format_du_post",
    nom: "Dans le format du post",
    definition:
      "L'appli est glissée dans le gabarit propre au post : définition et exemple, ❌ / ✅, jour N, tier list, question-réponse.",
    exemple: "« érudit : qui a une grande culture. exemple : utilise une appli comme Sophia pour le devenir »",
  },
  {
    code: "avant_apres",
    nom: "Avant / après",
    definition:
      "Un récit à la 1re personne : un problème ou un déclic, puis ce qui a changé avec l'appli.",
    exemple: "« je pensais que ça venait avec l'expérience. maintenant j'utilise l'appli Sophia… »",
  },
  {
    code: "habitude_perso",
    nom: "Mon habitude",
    definition: "Le créateur dit qu'il utilise l'appli, au présent, souvent à un moment de sa journée.",
    exemple: "« j'utilise l'appli Sophia tous les matins pendant mon café »",
  },
  {
    code: "ce_quils_font",
    nom: "Ce que font les autres",
    definition: "À la 3e personne : ce que font les gens qu'on admire, l'appli parmi leurs habitudes.",
    exemple: "« les gens qui comptent investissent dans leur esprit, souvent avec une appli comme Sophia »",
  },
  {
    code: "mention_breve",
    nom: "Mention brève",
    definition: "L'appli citée en une ligne, sans argument ni histoire.",
    exemple: "« 5. apprendre tous les jours / avec une appli comme Sophia »",
  },
  {
    code: "quand_tu",
    nom: "Le problème, puis l'appli",
    definition: "Une situation du lecteur (« quand tu… »), puis l'appli comme réponse, hors d'une liste de conseils.",
    exemple: "« quand tu te fais distraire en révisant : l'appli UnSwipe enlève les Reels »",
  },
  {
    code: "point_liste",
    nom: "Un point de la liste",
    definition:
      "L'appli est l'un des conseils du post, adressé au lecteur (impératif ou « tu »), souvent numéroté.",
    exemple: "« 3. apprends un truc chaque jour : une appli de culture générale comme Sophia… »",
  },
];

/** Décision d'Adrien (30/10) : le CTA va n'importe où à partir de la slide 4. */
export const SLIDE_CTA_MIN = 4;
