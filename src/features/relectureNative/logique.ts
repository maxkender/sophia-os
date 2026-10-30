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
 * le brief de rédaction (docs/fiches-langue-brief.md). Noms en anglais, comme
 * la fiche.
 */
export const FAMILLES_DE_TON: ReadonlyArray<{ nom: string; labels: ReadonlyArray<string> }> = [
  { nom: "Discipline & psychology", labels: ["alpha_male", "alpha_male_yellow", "alpha_male_film", "weird_alpha"] },
  { nom: "Cultured & elegant girl", labels: ["smart_girl", "beau_smart_girl", "white_bg"] },
  { nom: "Studies", labels: ["classic_study", "clean_study", "that_girl_study", "medical_study", "faceless_study"] },
  { nom: "Career", labels: ["RH"] },
  { nom: "Screens & self-improvement", labels: ["mentalmaxxing", "Fathomly"] },
];

/**
 * Modèle proposé quand la fiche d'une langue est encore vide (rubriques du
 * brief). La fiche est en anglais, avec les mots, tournures et accroches
 * natives cités tels quels dans la langue (décision d'Adrien, 30/10).
 */
export function modeleFicheLangue(nomAnglais: string, code: string): string {
  return [
    `# Language sheet: ${nomAnglais} (${code})`,
    "",
    `> Target variant: country, spelling. Sources: N native slideshows (OS bank), M of our posts, written on DD/MM. Rules in English; native words, phrases and hooks quoted verbatim in ${nomAnglais}.`,
    "",
    "## The 8 rules that matter most",
    "1. ",
    "",
    "## Register and address",
    "- ",
    "",
    "## Rhythm and layout",
    "- Sentence length, line breaks, words per slide:",
    "- Capitals, punctuation, numbering:",
    "- Emojis:",
    "",
    "## Hooks (slide 1)",
    "- Pattern: « native excerpt » (family)",
    "",
    "## Vocabulary",
    "### What natives actually say",
    "- ",
    "### Never write (translation calques)",
    "- « calque to avoid » → « native phrasing »",
    "",
    "## Endings and transitions",
    "- ",
    "",
    "## Tone families",
    ...FAMILLES_DE_TON.flatMap((f) => [`### ${f.nom} (${f.labels.join(", ")})`, "- ", ""]),
    "## What our translation gets wrong",
    "- Our post: « … » → A native would write: « … » (the rule)",
    "",
    "## Local specifics",
    "- School and exams, money, units, dates, references:",
    "",
    "## Sources",
    "- ",
    "",
  ].join("\n");
}
