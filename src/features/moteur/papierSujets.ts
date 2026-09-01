/** Catégories de sujets + styles de narration du master papier. */

export const PAPIER_CATEGORIES = [
  "aleatoire",
  "histoire",
  "faits_divers",
  "mythes",
  "science",
  "espace",
  "animaux",
  "geographie",
  "pop_culture",
  "origines",
  "personnages",
  "mysteres",
] as const;

export type PapierCategorie = (typeof PAPIER_CATEGORIES)[number];

export const PAPIER_STYLES_NARRATION = ["question", "revelation", "storytelling"] as const;
export type PapierStyleChoix = (typeof PAPIER_STYLES_NARRATION)[number];

export const CATEGORIE_BRIEF: Record<PapierCategorie, string> = {
  aleatoire:
    "Choisis un domaine (histoire, faits divers, mythes, science, espace, animaux, géographie, pop culture, origines, personnages ou mystères). La preuve matérielle (date, nom, chiffre, lieu) reste obligatoire.",
  histoire:
    "Big history question : un événement daté qui a basculé sur un détail concret — preuve matérielle obligatoire.",
  faits_divers:
    "True crime / odd news : une affaire résolue par un objet ou une analyse précise.",
  mythes: "Myths & legends : l'origine physique et vérifiable du mythe.",
  science: "Everyday science : un objet banal dont le fonctionnement réel surprend.",
  espace: "Space & universe : une mesure ou une observation datée, jamais de spéculation.",
  animaux: "Animals & nature : une capacité mesurée en labo, avec les chiffres.",
  geographie: "Geography : un lieu dont la forme s'explique par un événement identifié.",
  pop_culture:
    "Films & pop culture : une scène connue confrontée au calcul ou au fait réel. Pas de marque protégée dans les visuels.",
  origines: "Origins of things : l'accident ou l'erreur à l'origine d'un objet courant.",
  personnages: "Famous figures : un fait documenté qui contredit l'image du personnage.",
  mysteres: "Unsolved mysteries : ce que les preuves établissent VRAIMENT, et où ça s'arrête.",
};

export const STYLE_NARRATION_AIDE: Record<PapierStyleChoix, string> = {
  question: "« Mais savez-vous vraiment pourquoi... ? »",
  revelation: "Indices, puis retournement final",
  storytelling: "On raconte la scène vécue",
};

export function estCategoriePapier(v: string): v is PapierCategorie {
  return (PAPIER_CATEGORIES as readonly string[]).includes(v);
}

export function estStyleChoix(v: string): v is PapierStyleChoix {
  return (PAPIER_STYLES_NARRATION as readonly string[]).includes(v);
}

export function normaliserCategorie(v: unknown): PapierCategorie {
  const s = String(v ?? "").trim();
  return estCategoriePapier(s) ? s : "aleatoire";
}

export function normaliserStyleChoix(v: unknown): PapierStyleChoix {
  const s = String(v ?? "").trim();
  return estStyleChoix(s) ? s : "revelation";
}
