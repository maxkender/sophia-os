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

/**
 * Modèle de la fiche CTA (0623) : l'intro commune à toutes les applis et
 * toutes les langues pour amener l'appli dans le deck, tirée du prompt
 * `placement_sophia`. En anglais, comme les fiches langue (décision d'Adrien,
 * 30/10). Sans ce qui va ailleurs : les faits et le nom de l'appli (fiche
 * appli), les mots d'une langue (fiche langue), le format du deck et les
 * exemples de placement (fiche label). Plus de forme tirée par l'OS (0624).
 */
export function modeleFicheCta(): string {
  return [
    "# CTA sheet",
    "",
    "> How the app enters a slideshow: the same rules for every app and every language. What the app does and how to name it: app sheet. How a native says it: language sheet. Where it usually goes in this kind of deck, with real examples: label sheet.",
    "",
    "## What the CTA slide must do",
    "One slide talks about the app without ever looking like an ad. It is written in exactly the same mould as the slides around it (same layout, same length, same tone), as if the same person wrote the whole slideshow in one go. The slide gives a real piece of advice that answers the hook, and the app blends in as the obvious way to apply it. The reader never feels the seam.",
    "",
    "## Always one CTA",
    "Whatever the topic, one slide carries the app: inside an existing slide, or in place of one.",
    "",
    "## The hook stays as it is",
    "- The CTA never changes the hook (slide 1): not its words, not its promise, not its number (« 5 habits… » stays 5 habits). The CTA adapts to the hook, never the other way round.",
    "- The hook never announces, hints at or sets up the app.",
    "- If the hook announces N items, the deck still has N items: the CTA blends into one of them or replaces one, it never adds one.",
    "",
    "## The golden rule",
    "1. The title is a real piece of advice, of the same kind as the other items of the list, that answers the hook. It would stand without the app.",
    "2. The slide has exactly the layout of its neighbours (title + short line, title + 2 sentences…) and their length, within ±20 %. Never an extra paragraph for the app.",
    "3. The app blends into the explanation: the same sentence says why the advice works and how to apply it. Never an ad sentence tacked on at the end.",
    "4. The link is logical: the app is the obvious way to apply this advice. If not, take another idea from the app sheet.",
    "5. The thread of the deck: in a slideshow that tells a story, the slide stays a moment of that story (same « I », same situation, same idea as the slide it replaces). The app arrives as what the person did at that moment, never as a new topic.",
    "",
    "Test: read the slide before, yours and the slide after in one go. If the story jumps, or if your slide stands out as the ad, start again.",
    "",
    "## Global coherence with the deck",
    "- Mode, read on at least two other slides: instructive (the slides speak to the reader) or confession (every slide in the first person). The CTA follows the dominant mode; with none, instructive. Same politeness as the neighbours.",
    "- Voice: a first-person habit (« I… ») in a confession deck; the same « you » as the list in an instructive deck; « they » in a deck about what other people do. In a deck of very short, dry lines: never « I ».",
    "- Gender: the persona line if given, otherwise the slides; with no clue, turn the sentence to avoid agreement.",
    "- Number: the one written at the start of the replaced slide (« 3. », « 3) », « #3 »), never its position in the deck. If it has none, yours has none. Reread the whole list: no gap, no duplicate.",
    "- Case, punctuation, line breaks and emojis: exactly those of the neighbours. Never a Title Case they do not use.",
    "- No exam or school system the neighbouring slides do not already mention.",
    "",
    "## Which slide",
    "- Never before slide 4, never the cover.",
    "- If the OS imposes the slide (the original recommended a competing app, or the pod marked the app slide), use that one: keep its title and idea, swap only the tool, and make the app the way to apply the advice.",
    "- Otherwise, take the slide that breaks nothing: not a pure CTA (« follow for more »), not the conclusion that closes the deck, not the item the hook puts forward (« the #1 »), not a story or before/after step, not an empty slide.",
    "- A list of knowledge (words, books, facts, quotes): never replace an item; keep it and blend the app into its explanation.",
    "- An @handle or interface text on the replaced slide disappears.",
    "",
    "## Never, in any language",
    "- Presenting the app as a brand (« the … app », « an app called … ») or any imperative with it (« use », « download », « try »).",
    "- Ad words and their equivalents: download, try, test, subscribe, click, don't miss, enjoy, must-have, the best app, give it a try, check it out, 👀.",
    "- The product page: describing the app like the App Store, « available on », « helps you… », « so you never… », two features in the same sentence.",
    "- Aphorisms « X isn't Y, it's Z » and abstract words (ecosystem, paradigm, approach, process).",
    "- The em dash « — », « – » or « -- », even once.",
    "- More than one mention of the app; an @, a link or a hashtag on the slide.",
    "- Robotic passive (« until a lesson is read ») and forced constructions (« your depth comes from… »): active voice, clear subject.",
    "- Slang and bookish words: the most common everyday words (the language sheet lists them).",
    "",
    "## Before answering",
    "- Is the hook (slide 1) untouched: same words, same promise, same number of items?",
    "- Is the title a real piece of advice that stands without the app?",
    "- Same layout and length as the neighbours, with no extra paragraph?",
    "- Is the app blended into the explanation, with an obvious link to the advice?",
    "- Story deck: do the slide before, yours and the slide after read in one go?",
    "- Slide 4 or later, or the slide the OS imposed?",
    "- Number, case, mode, voice and gender identical to the neighbours?",
    "- No forbidden word, no em dash, one single mention of the app?",
    "- Read among the other slides, does the slide go unnoticed as an ad?",
    "",
  ].join("\n");
}

/**
 * Modèle de la fiche d'un label (0624) : l'angle de placement de Maximilien
 * (`angles_placement`, ce que l'appli apporte selon le sujet du post), puis où
 * va l'appli dans ce type de deck, avec des exemples réels de placements
 * réussis. Écrite, plus calculée : les vues ne jugent pas un CTA.
 */
export function modeleFicheLabel(label: string): string {
  return [
    `# Label sheet: ${label}`,
    "",
    "> Apps: … How the app enters this kind of deck. Sources: our published posts and the placement angle (Admin → labels). The examples are real posts of ours, quoted as published; adapt the idea, never copy the sentence.",
    "",
    "## The deck",
    "- Hooks:",
    "- Slides (layout, length, voice):",
    "",
    "## The angle: what the app brings, by topic",
    "- IF the post is about …: …",
    "- OTHERWISE: …",
    "- Tone:",
    "- Persona:",
    "",
    "## Where the app goes",
    "- ",
    "",
    "## Placement examples",
    "### 1. « hook »",
    "- Slide before: « … »",
    "- App slide: « … »",
    "- Why it works:",
    "",
    "## Avoid in this label",
    "- ",
    "",
  ].join("\n");
}
