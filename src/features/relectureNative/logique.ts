import type { PosterProfil } from "@/features/moteur/types";

import { FORMES_CTA, SLIDE_CTA_MIN } from "./formesCta";

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

/**
 * Modèle de la fiche CTA (0623) : les règles communes à toutes les applis et
 * toutes les langues pour écrire le CTA, tirées du prompt `placement_sophia`.
 * Sans ce qui va ailleurs : les faits et le nom de l'appli (fiche appli), les
 * mots d'une langue (fiche langue), l'angle et les formes qui marchent (fiche
 * label), et les tirages déguisés du prompt (place au nombre de mots, voix au
 * nombre de mots du hook) : l'OS commande la voie et la forme de chaque deck.
 */
export function modeleFicheCta(): string {
  return [
    "# Fiche CTA",
    "",
    "> Les règles pour amener l'appli dans le slideshow, les mêmes pour toutes les applis et toutes les langues. Ce que fait l'appli et comment la nommer : fiche appli. Comment un natif le dit : fiche langue. Quelle forme : commandée par l'OS pour chaque deck (fiche label).",
    "",
    "## Ce que le CTA doit produire",
    "Une slide qui parle de l'appli sans jamais avoir l'air d'une pub, écrite exactement dans le même moule que les slides autour d'elle (même format, même longueur, même ton), comme si la même personne avait écrit tout le slideshow d'une traite. La slide donne un vrai conseil qui répond au problème du hook, et l'appli s'y fond comme le moyen logique de l'appliquer. Le lecteur ne sent jamais la couture.",
    "",
    "## Toujours un CTA",
    "Quel que soit le sujet, une slide porte l'appli : dans une slide existante, ou à la place d'une slide.",
    "",
    "## La règle d'or",
    "1. Le titre est un vrai conseil, de même nature que les autres éléments de la liste, qui répond au problème du hook. Il tiendrait debout sans l'appli.",
    "2. La slide a exactement le format des voisines (titre + ligne courte, titre + 2 phrases…) et leur longueur, à ±20 % près. Jamais un paragraphe en plus pour l'appli.",
    "3. L'appli se fond dans l'explication : la même phrase dit pourquoi le conseil marche et comment on l'applique. Ce n'est pas une phrase de pub ajoutée à la fin.",
    "4. Le lien est logique : l'appli est le moyen évident d'appliquer ce conseil-là. Sinon, prends une autre idée de la fiche appli.",
    "5. Le fil du deck : dans un slideshow qui raconte une histoire, la slide reste un moment de cette histoire (même « je », même situation, même idée que la slide remplacée). L'appli arrive comme ce que la personne a fait à ce moment-là, jamais comme un nouveau sujet.",
    "",
    "Test : lis la slide d'avant, la tienne et celle d'après d'une traite. Si l'histoire saute, ou si ta slide se repère comme la pub, recommence.",
    "",
    "## Ce que l'OS commande pour chaque deck",
    "- **La voie** :",
    "  - `reprise` : l'original recommande une appli concurrente, et cette slide est imposée. Si l'outil sert à apprendre, garde le titre et l'idée de la slide, enlève seulement l'outil, et fais de l'appli le moyen d'appliquer ce conseil. Si l'outil n'a rien à voir (CV, notes, productivité…), garde le moment de l'histoire (la scène, la citation, le chiffre) et fais arriver l'appli comme sa suite logique ;",
    "  - `marquee` : le podz a marqué la slide de l'appli ; c'est elle ;",
    "  - `prouvee` ou `essai` : écris dans la forme commandée.",
    "- **La forme** : une des formes ci-dessous. Suis-la. Si elle casse le post, reprends le CTA de l'original et dis pourquoi : le refus est noté.",
    ...FORMES_CTA.map((f) => `  - ${f.nom} (\`${f.code}\`) : ${f.definition}`),
    "",
    "## Le choix de la slide",
    `- Jamais avant la slide ${SLIDE_CTA_MIN}, jamais la couverture.`,
    "- Hors voie `reprise` ou `marquee`, prends la slide qui ne casse rien : pas un pur CTA (« follow for more »), pas la conclusion qui clôt le slideshow, pas l'élément que le hook met en avant (« le n°1 »), pas une étape d'histoire ou d'avant / après, pas une slide vide.",
    "- Énumération de savoir (mots, livres, faits, citations) : ne remplace jamais un élément ; garde-le et fonds l'appli dans son explication.",
    "- Un @pseudo ou du texte d'interface dans la slide remplacée disparaît.",
    "",
    "## Mode, voix et genre",
    "- Le mode du deck, lu sur au moins deux autres slides : instructif (la slide s'adresse au lecteur) ou confession (chaque slide à la 1re personne). Le titre suit le mode dominant ; sans dominante, instructif. Même politesse que les voisines.",
    "- La voix de la phrase qui porte l'appli suit la forme commandée (mon habitude : je ; un point de la liste : tu ; ce que font les autres : ils). Deck en confession : je. Deck en lignes très courtes et sèches : jamais je.",
    "- Le genre : la ligne persona si elle est fournie, sinon les slides ; sans indice, tourne la phrase pour éviter l'accord.",
    "",
    "## La forme du texte",
    "- Numéro : celui écrit au début du texte de la slide remplacée (« 3. », « 3) », « #3 »), jamais sa position dans le deck. Si elle n'en a pas, la tienne non plus. Relis toute la liste : elle se suit sans trou ni doublon.",
    "- Casse, ponctuation, retours à la ligne et emojis : exactement ceux des voisines. Jamais de Title Case qu'elles n'ont pas.",
    "- Aucun examen ni système scolaire que les slides voisines ne citent pas déjà.",
    "",
    "## Interdits, dans toutes les langues",
    "- Présenter l'appli comme une marque (« the … app », « an app called … ») et tout impératif avec elle (« use », « download », « try »).",
    "- Les mots de pub : télécharge, essaie, teste, abonne-toi, clique, ne rate pas, profite de, incontournable, la meilleure appli, give it a try, check it out, 👀.",
    "- La fiche produit : décrire l'appli comme sur l'App Store, « available on », « help you… », « so you never… », deux fonctionnalités dans la même phrase.",
    "- Les aphorismes « X n'est pas Y, c'est Z » et les mots abstraits (écosystème, paradigme, démarche, processus).",
    "- Le tiret cadratin « — », « – » ou « -- », même une fois.",
    "- Plus d'une mention de l'appli ; un @, un lien ou un hashtag dans la slide.",
    "- Le passif robotique (« until a lesson is read ») et les constructions forcées (« your depth comes from… ») : voix active, sujet clair.",
    "- L'argot et les mots de livre : les mots les plus courants de la vie de tous les jours (la fiche langue liste ceux de chaque langue).",
    "",
    "## Avant de répondre",
    "- Le titre est un vrai conseil qui tient sans l'appli ?",
    "- Même format et même longueur que les voisines, sans paragraphe en plus ?",
    "- L'appli est fondue dans l'explication, avec un lien évident avec le conseil ?",
    "- Deck-histoire : la slide d'avant, la tienne et celle d'après se lisent d'une traite ?",
    "- La voie et la forme commandées sont suivies, ou le refus est expliqué ?",
    `- Slide ${SLIDE_CTA_MIN} ou plus, ou la slide imposée par la voie ?`,
    "- Numéro, casse, mode et genre identiques aux voisines ?",
    "- Aucun interdit, aucun tiret cadratin, une seule mention de l'appli ?",
    "- Lue au milieu des autres slides, la slide passe inaperçue comme pub ?",
    "",
  ].join("\n");
}
