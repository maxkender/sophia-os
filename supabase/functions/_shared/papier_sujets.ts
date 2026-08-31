/** Copie Deno de src/features/moteur/papierSujets.ts — garder synchro. */

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
    "Choisis librement un domaine de culture générale (histoire, science, mythes, espace, animaux, géographie, pop culture, origines, personnages ou mystères).",
  histoire: "Grande question d'histoire : un événement, une civilisation ou une décision dont on connaît le nom mais pas vraiment le pourquoi.",
  faits_divers: "Faits divers vrais et surprenants, ancrés dans un lieu et une date, racontables comme une petite enquête.",
  mythes: "Mythes et légendes : une créature, un rite ou une histoire que tout le monde croit connaître, avec un fond réel ou une explication claire.",
  science: "Science du quotidien : un phénomène banal (sommeil, sel, feu, couleurs) dont la cause réelle est contre-intuitive.",
  espace: "Espace et univers : un fait astronomique concret, visualisable, sans jargon.",
  animaux: "Animaux et nature : un comportement ou une adaptation précise, vérifiable, qui retourne une idée reçue.",
  geographie: "Géographie : un lieu, une frontière, un climat ou une carte dont l'explication est inattendue.",
  pop_culture: "Films et pop culture : une origine, une anecdote de tournage ou un détail d'œuvre célèbre, sans citer de marque protégée dans les visuels.",
  origines: "Origines des choses : d'où vient un objet, un geste ou un mot du quotidien.",
  personnages: "Personnages célèbres : un épisode précis de leur vie, peu connu, qui éclaire qui ils étaient.",
  mysteres: "Mystères non résolus : une affaire ou une énigme réelle, avec les faits établis et ce qui reste ouvert — sans invention.",
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
