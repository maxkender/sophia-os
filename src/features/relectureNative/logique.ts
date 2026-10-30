import type { PosterProfil } from "@/features/moteur/types";

/** invite : choisi · actif : validé · pause · retire. */
export const STATUTS_RELECTEUR = ["invite", "actif", "pause", "retire"] as const;
export type StatutRelecteur = (typeof STATUTS_RELECTEUR)[number];

/** L'espace relecteur ne s'ouvre qu'aux relecteurs invités ou actifs, et quand l'admin l'a ouvert. */
export function relecteursAvecEspace<T extends { statut: string }>(relecteurs: ReadonlyArray<T>, espaceOuvert: boolean): T[] {
  if (!espaceOuvert) return [];
  return relecteurs.filter((r) => r.statut === "invite" || r.statut === "actif");
}

/** Modèle proposé quand la fiche d'une appli est encore vide. */
export function modeleFicheAppli(nom: string): string {
  return [
    `# ${nom}`,
    "",
    "## Ce que fait l'appli",
    "En deux ou trois phrases : ce que l'utilisateur y fait, chaque jour.",
    "",
    "## À qui elle s'adresse",
    "- ",
    "",
    "## Ce qu'on a le droit d'affirmer",
    "- ",
    "",
    "## Ce qu'on ne dit jamais",
    "- Promesses de résultats, chiffres non vérifiés…",
    "",
    "## Les fonctionnalités qu'on peut citer",
    "- ",
    "",
    "## Comment la nommer",
    `- Nom exact : ${nom}, jamais traduit.`,
    "- Le mot « appli » se dit dans la langue du post (la fiche langue le précise).",
    "",
    "## Les captures disponibles",
    "- ",
    "",
    "## Ses concurrents",
    "- Les applis qu'on ne cite jamais, ou qu'on remplace.",
    "",
  ].join("\n");
}

/** Langues dans lesquelles le posteur publie, d'abord celles de ses comptes. */
export function languesDuPoster(p: Pick<PosterProfil, "comptes" | "langues">): string[] {
  const vues = new Set<string>();
  for (const c of p.comptes ?? []) if (c.langue) vues.add(c.langue);
  for (const l of p.langues ?? []) if (l) vues.add(l);
  return [...vues];
}

/**
 * Les familles de ton d'une fiche langue : les labels qui s'écrivent pareil.
 * Un label sans exemple natif emprunte le ton de sa famille. Même liste que
 * le brief de rédaction (docs/fiches-langue-brief.md).
 */
export const FAMILLES_DE_TON: ReadonlyArray<{ nom: string; labels: ReadonlyArray<string> }> = [
  { nom: "Discipline et psychologie", labels: ["alpha_male", "alpha_male_yellow", "alpha_male_film", "weird_alpha"] },
  { nom: "Fille cultivée et élégante", labels: ["smart_girl", "beau_smart_girl", "white_bg"] },
  { nom: "Études", labels: ["classic_study", "clean_study", "that_girl_study", "medical_study", "faceless_study"] },
  { nom: "Carrière", labels: ["RH"] },
  { nom: "Écrans et auto-amélioration", labels: ["mentalmaxxing", "Fathomly"] },
];

/** Modèle proposé quand la fiche d'une langue est encore vide (rubriques du brief). */
export function modeleFicheLangue(nomLangue: string): string {
  return [
    `# Fiche langue : ${nomLangue}`,
    "",
    "> Variante visée : pays, orthographe. Sources : N slideshows natifs (banque de l'OS), M posts de l'OS, extraits le JJ/MM.",
    "",
    "## L'essentiel en 8 règles",
    "1. ",
    "",
    "## Registre et adresse",
    "- ",
    "",
    "## Rythme et mise en page",
    "- Longueur des phrases, retours à la ligne, mots par slide :",
    "- Majuscules, ponctuation, numérotation :",
    "- Émojis :",
    "",
    "## Accroches (slide 1)",
    "- Structure : « extrait natif » (famille)",
    "",
    "## Vocabulaire",
    "### Ce que disent les natifs",
    "- ",
    "### À bannir (calques et tournures de traduction)",
    "- « tournure à éviter » → « tournure native »",
    "",
    "## Fins de slideshow et transitions",
    "- ",
    "",
    "## Familles de ton",
    ...FAMILLES_DE_TON.flatMap((f) => [`### ${f.nom} (${f.labels.join(", ")})`, "- ", ""]),
    "## Ce que notre traduction rate aujourd'hui",
    "- Notre post : « … » → Comme un natif : « … » (la règle)",
    "",
    "## Spécificités locales",
    "- École et études, argent, unités, dates, références :",
    "",
    "## Sources",
    "- ",
    "",
  ].join("\n");
}
