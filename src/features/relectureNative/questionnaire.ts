/**
 * Questionnaire « Your country, part by part » des relecteurs natifs.
 *
 * Repris tel quel de la page Notion « Questionnaire relecteurs natifs »
 * (version validée par Adrien le 27/10). Les textes sont en anglais : c'est ce
 * que voit le relecteur, qui répond dans SA langue.
 *
 * Les clés sont stables : une réponse reste rattachée à sa question même si la
 * numérotation change. Changer le texte d'une question garde ses réponses ;
 * changer sa clé les orpheline (elles restent en base, mais ne s'affichent plus).
 */

export interface QuestionRelecteur {
  cle: string;
  texte: string;
  /** Extrait réel de nos slideshows, montré sous la question (📌). */
  extrait?: string;
}

export interface PartieQuestionnaire {
  cle: string;
  titre: string;
  /** Partie « mots » : un choix par mot au lieu d'une question ouverte. */
  mots?: boolean;
  questions: QuestionRelecteur[];
}

/** Consignes affichées en tête du questionnaire, telles qu'écrites dans Notion. */
export const CONSIGNES_QUESTIONNAIRE = [
  "RESPOND IN YOUR LANGUAGE, NOT IN ENGLISH. also don’t try to be ‘correct’, be ‘natural’, use slang if it is what is used etc…",
  "Take liberties, if people in your country don’t do that ⇒ propose alternative etc… the idea is to be natural to appeal to your language",
] as const;

export const QUESTION_INTRO: QuestionRelecteur = {
  cle: "intro.pays",
  texte: "What country are you in?",
};

/** Les 38 mots anglais de la Part 2 : le relecteur dit s'il les garde ou les traduit. */
export const MOTS_ANGLAIS = [
  "brain rot",
  "doomscrolling",
  "dopamine detox",
  "journaling",
  "glow up",
  "that girl",
  "it girl",
  "main character",
  "aura",
  "rizz",
  "sigma",
  "NPC",
  "alpha / high-value man",
  "mogging",
  "looksmaxxing",
  "situationship",
  "ghosting",
  "red flag / green flag",
  "old money",
  "quiet luxury",
  "clean girl",
  "soft life",
  "side hustle",
  "9-to-5",
  "5am club",
  "morning routine",
  "self-care",
  "mindset",
  "discipline",
  "cold plunge",
  "gym bro",
  "POV",
  "study with me",
  "aesthetic",
  "vibe",
  "delulu",
  "lowkey",
  "romanticize your life",
] as const;

/** Clé de réponse d'un mot de la Part 2 (« mot.brain-rot »). */
export function cleMot(mot: string): string {
  return `mot.${mot
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

export const PARTIES_QUESTIONNAIRE: PartieQuestionnaire[] = [
  {
    cle: "ecole",
    titre: "Part 1 · School & studying",
    questions: [
      {
        cle: "ecole.examen_fin_lycee",
        texte: "What is the big exam at the end of high school called, and how is it graded? What score is \"excellent\"?",
        extrait: "i started revising properly 1 month before GCSEs",
      },
      { cle: "ecole.examen_15_16", texte: "Is there a big exam around age 15-16? What is it called?" },
      {
        cle: "ecole.annees",
        texte: "What are school years called from age 11 to 18? How would you say \"Year 11\" or \"senior year\"?",
      },
      {
        cle: "ecole.vocabulaire_examens",
        texte: "How do you say \"finals\", \"midterms\", \"exam season\", \"revising\"?",
        extrait: "we tested every study app for our finals",
      },
      {
        cle: "ecole.calendrier",
        texte: "Semesters or terms? When does the school year start, and when are the big exams?",
      },
      {
        cle: "ecole.universite",
        texte: "What do you call university and its students? Is there a word like \"freshman\"?",
      },
      {
        cle: "ecole.grandes_universites",
        texte: "Which universities are the \"Harvard / Oxford\" of your country?",
        extrait: "college ideas: harvard, duke, university of michigan",
      },
      {
        cle: "ecole.heures_libres",
        texte: "What are \"free periods\" called at school?",
        extrait: "use your free periods",
      },
      { cle: "ecole.bonne_note", texte: "What does a really good grade look like? (20/20, 6, A*, 10…)" },
      {
        cle: "ecole.matieres",
        texte:
          "School subjects: how do students say Maths, Biology, History, English Lit? Is \"English\" a foreign-language class for you?",
        extrait: "how i feel when i go into the english exam",
      },
      {
        cle: "ecole.methodes",
        texte:
          "Do students know \"Pomodoro\", \"Feynman technique\", \"active recall\", \"spaced repetition\", \"flashcards\"? In English or translated?",
      },
      {
        cle: "ecole.applis_etude",
        texte: "Which study apps do students really use? (Quizlet, Anki, Notion, GoodNotes, ChatGPT, local ones?)",
      },
      {
        cle: "ecole.cours_en_ligne",
        texte: "Do people take online courses in English (Coursera, edX, Yale)? Any local platforms?",
        extrait: "The Science of Well-Being — Yale University. Platform: Coursera",
      },
      {
        cle: "ecole.lieux_etude",
        texte: "Where do students study outside home? (library, café, study rooms…)",
      },
      {
        cle: "ecole.study_aesthetic",
        texte:
          "\"Study with me\", \"romanticize studying\", \"that girl\" study aesthetic: is it a trend where you live? What do people call it?",
        extrait: "how i romanticized studying until i actually started looking forward to it",
      },
    ],
  },
  {
    cle: "mots",
    titre: "Part 2 · English words: keep them or translate them?",
    mots: true,
    questions: [],
  },
  {
    cle: "texte",
    titre: "Part 3 · How TikTok text looks in your language",
    questions: [
      { cle: "texte.numerotation", texte: "How are lists numbered: \"1.\" / \"1)\" / \"①\"?" },
      {
        cle: "texte.pourcentages",
        texte: "How do you write percentages and decimals? (50% or 50 %, 2.5 or 2,5)",
      },
      {
        cle: "texte.heures",
        texte: "How do you write times? (5am, 5h, 5:00, 05:00)",
        extrait: "you do not have to wake up at 5am",
      },
      {
        cle: "texte.unites",
        texte: "Units: km or miles? kg or lbs? °C or °F?",
        extrait: "climbing 50 steps daily…",
      },
      {
        cle: "texte.tendances_virales",
        texte: "any viral trends ? viral wording ? viral meme only in your country?",
      },
    ],
  },
  {
    cle: "ton",
    titre: "Part 4 · Voice & tone",
    questions: [
      {
        cle: "ton.tutoiement",
        texte: "On TikTok, do creators talk to viewers with informal or formal \"you\"? Singular or plural?",
      },
      {
        cle: "ton.genre",
        texte: "In first-person posts by a girl (or by a guy), what grammar should we watch? (gender agreement…)",
      },
    ],
  },
  {
    cle: "argent",
    titre: "Part 5 · Money & work",
    questions: [
      { cle: "argent.prix", texte: "How do you write prices? (€5, 5 €, 5,00 €, 5 TL…)" },
      {
        cle: "argent.prix_courants",
        texte: "Price of a coffee, a student lunch, a gym month: give real numbers.",
      },
      {
        cle: "argent.investir",
        texte: "Do people your age talk about investing (stocks, ETFs, crypto)? Which words?",
        extrait: "20% of income directly to investments before you see it",
      },
      {
        cle: "argent.conseils",
        texte: "What money advice do people your age actually give each other?",
      },
      {
        cle: "argent.side_hustle",
        texte: "How do you say \"9-to-5\" and \"side hustle\"? Are they a thing?",
        extrait: "Debt chains are heavier than any 9 to 5",
      },
      { cle: "argent.cv", texte: "CV or résumé? Do people your age use LinkedIn?" },
      {
        cle: "argent.bon_travail",
        texte: "What is a \"good job\" in the eyes of parents where you live?",
      },
    ],
  },
  {
    cle: "vie",
    titre: "Part 6 · Daily life",
    questions: [
      {
        cle: "vie.sorties_amis",
        texte: "When friends meet up, what do they go for: coffee, tea, bubble tea, a bar, food?",
        extrait: "Meet someone for coffee. Have a real conversation.",
      },
      {
        cle: "vie.petit_dejeuner",
        texte: "What is a typical breakfast? What does \"eating healthy\" mean locally?",
      },
      {
        cle: "vie.week_end",
        texte: "Weekend plans for 18-25 year olds?",
        extrait: "Mini golf, a market, a museum",
      },
      {
        cle: "vie.rencontres",
        texte: "Which dating apps are used? Texting habits? (\"text back\", \"ghosting\")",
      },
    ],
  },
  {
    cle: "culture",
    titre: "Part 7 · Culture & role models",
    questions: [
      {
        cle: "culture.auteurs",
        texte: "Name 5 classic authors every \"cultured\" person in your country is expected to know.",
      },
      {
        cle: "culture.philosophes",
        texte: "Which philosopher or thinker do people quote on TikTok where you live?",
      },
      {
        cle: "culture.livres",
        texte:
          "When a slide recommends a book, do people read it in English, in translation, or not at all? Should we use the local title?",
        extrait: "\"The Great Influenza\", \"Atomic Habits\"",
      },
      { cle: "culture.musees", texte: "The museum(s) everyone in your country knows." },
      {
        cle: "culture.vin",
        texte: "Is knowing about wine a \"classy\" thing for you? What would be the local equivalent?",
        extrait: "Know how to order wine without the drama",
      },
      {
        cle: "culture.jeux",
        texte: "Chess, sudoku, crosswords, Wordle: popular? Any local brain games?",
      },
      {
        cle: "culture.personnages",
        texte:
          "Do people know Rory Gilmore, Blair Waldorf, Harvey Specter, Thomas Shelby? Who are the local equivalents?",
        extrait: "are these popular characters academic role models or not? Blair Waldorf",
      },
      {
        cle: "culture.celebrites",
        texte:
          "A local celebrity seen as smart and cultured (woman), and one seen as disciplined and successful (man).",
      },
    ],
  },
  {
    cle: "internet",
    titre: "Part 8 · Apps & internet",
    questions: [
      {
        cle: "internet.messagerie",
        texte: "Which app do you use to text friends? (WhatsApp, iMessage, Telegram, Snapchat…)",
      },
      { cle: "internet.reseaux", texte: "Besides TikTok, which social apps do people your age use?" },
      { cle: "internet.podcasts", texte: "Podcasts: in English or local? Which ones are popular?" },
      { cle: "internet.ia", texte: "Do students use ChatGPT / AI? What do they call it?" },
      {
        cle: "internet.youtube",
        texte: "A YouTube channel for learning in your language (like \"Crash Course\")?",
      },
      {
        cle: "internet.hashtags",
        texte:
          "Hashtags people use in your language for studying, books and self-improvement (local versions of #studytok, #booktok).",
      },
      {
        cle: "internet.createurs",
        texte: "popular creators / tiktok accounts in your language ? doing tiktok carousels ?",
      },
    ],
  },
  {
    cle: "applis",
    titre: "Part 9 · Our apps",
    questions: [
      {
        cle: "applis.nom",
        texte:
          "How would you naturally say \"the Sophia app\", \"the micabo app\", \"the UnSwipe app\"? Do you say \"app\" in English?",
      },
    ],
  },
];

/** Les questions ouvertes, dans l'ordre, avec leur numéro affiché (1 à 49). */
export function questionsNumerotees(): Array<QuestionRelecteur & { numero: number; partie: string }> {
  let n = 0;
  return PARTIES_QUESTIONNAIRE.flatMap((p) =>
    p.questions.map((q) => {
      n += 1;
      return { ...q, numero: n, partie: p.cle };
    }),
  );
}

/** Toutes les clés attendues : l'intro, les questions ouvertes, puis les mots. */
export function clesQuestionnaire(): string[] {
  return [QUESTION_INTRO.cle, ...questionsNumerotees().map((q) => q.cle), ...MOTS_ANGLAIS.map(cleMot)];
}
