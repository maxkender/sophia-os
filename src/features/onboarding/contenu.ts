/**
 * Le texte du parcours d'accueil des créateurs slideshow.
 *
 * EN ANGLAIS SEULEMENT, et volontairement HORS des fichiers de langue.
 * Décision du 11/10/2026 : on ne traduit pas encore. Le repli i18n du projet
 * est `fr` (voir `src/locales/index.ts`), donc poser les clés dans `en.ts`
 * seulement aurait renvoyé du vide à une interface en français. Plutôt que de
 * recopier de l'anglais dans `fr.ts` en faisant semblant que c'est traduit, le
 * texte vit ici. Le jour où on traduit : déplacer ces chaînes dans les deux
 * fichiers de langue et faire passer `ECRANS` par `t()`.
 *
 * Les comptes UGC vidéo (pod 3) ne passent PAS par ici : ils gardent leur
 * pop-up d'étapes, inchangée (voir `OnboardingPopup`).
 */

/** Lien d'intégration de la démo Loom (« How to Post TikTok Slide Shows »). */
export const LOOM_EMBED = "https://www.loom.com/embed/c79229ddee5d4dfd84f38e1f4d2f731c";

/**
 * Attente imposée sur l'écran « Posting », en secondes.
 *
 * La démo Loom dure 203,6 s. On a d'abord calé l'attente dessus, puis ramenée
 * à 60 s : bloquer 3 min 24 sur un bouton verrouillé décourage plus que ça
 * n'instruit, et c'est le quiz qui vérifie vraiment que la vidéo a servi.
 * Assez long pour qu'on ne clique pas sans regarder, assez court pour ne pas
 * faire fuir.
 */
export const ATTENTE_VIDEO_S = 60;

/** La vidéo du warm-up (37 s), servie depuis `public/onboarding`. */
export const VIDEO_WARMUP = "/onboarding/warmup.mp4";
export const VIDEO_WARMUP_IMAGE = "/onboarding/warmup-poster.jpg";

/** Attente de l'écran du warm-up : le temps de la vidéo, en entier. */
export const ATTENTE_WARMUP_S = 40;

/** Attente par défaut d'un écran de texte, en secondes. */
export const ATTENTE_TEXTE_S = 8;

/** Le guide complet, pour toute question qui dépasse cet accueil. */
export const LIEN_GUIDE = "https://star-water-a0e.notion.site/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";

/**
 * 13/11 (Max) : LA règle des questions, la même partout (popups, dashboard, FAQ, quiz, emails,
 * Upwork et Ruul). 1. Help dans le dashboard ; 2. Slack, dans le bon salon ; 3. l'argent : Help
 * d'abord, puis un DM à Maximilien Kender seulement si c'est vraiment nécessaire.
 * Plus jamais #questions, #ruul-questions, « DM Lucia », « ask all your questions in a channel ».
 */
export const SALON_POSTING_HELP = "#posting-help";
export const SALON_RUUL = "#ruul-posters";
export const SALON_UPWORK = "#upwork-posters";
export const REGLE_HELP =
  "**Any question or problem?** Click **Help** on your dashboard. You get an answer right away, and if needed it goes to our team.";
export const regleSlack = (ruul: boolean) =>
  `**Slack**, in the right channel: **${SALON_POSTING_HELP}** for problems with your posts, **${ruul ? SALON_RUUL : SALON_UPWORK}** for your platform. Please make sure you join Slack.`;
export const REGLE_ARGENT =
  "**Money**: ask **Help** first (it goes to our team if needed). If there is really a problem, DM **Maximilien Kender** on Slack, only if truly needed.";
/** La règle n° 3 en texte simple (pages sans gras). */
export const QUESTIONS_PAIE =
  "Questions about money: ask Help on your dashboard first (it goes to our team if needed). If there is really a problem, DM Maximilien Kender on Slack, only if truly needed.";

/** Le salon Slack de la plateforme d'un posteur Ruul (rejoindre Slack). */
export const SALON_COHORTE_RUUL = SALON_RUUL;

import type { EtatMico } from "./Mico";

/**
 * Les textes acceptent le gras en **double étoile** (rendu par le parcours).
 */
export type Bloc =
  | { type: "p"; texte: string }
  | { type: "liste"; items: string[] }
  | { type: "etapes"; items: string[] }
  | { type: "titre"; texte: string }
  /** « vif » : fond rouge plein, texte blanc, pour la règle qu'on ne peut pas rater. */
  | { type: "alerte"; ton: "rouge" | "orange" | "vif"; titre?: string; items: string[] }
  /** Une frise verticale : quand, quoi, détail. */
  | { type: "frise"; items: { quand: string; titre: string; texte?: string }[] }
  /** `fichier` : une vidéo du site (balise <video>, verticale), sinon un lecteur intégré. */
  | { type: "video"; src: string; titre: string; fichier?: boolean; image?: string }
  | { type: "lien"; avant?: string; libelle: string; href: string }
  /** Une règle aux posteurs lue dans son réglage (le lien, le warm-up), chantier du 28 oct. */
  | { type: "regle"; regle: "lien" | "warmup" }
  /** « Join Slack » : le lien du réglage `slack_lien_invitation` (prompt 21, C8 : le seul). */
  | { type: "rejoindreSlack" }
  /** Formulaire prénom + nom de la pièce d'identité (cohorte Ruul) : verrouille « Next ». */
  | { type: "identite" };

export interface Ecran {
  /** Identifiant stable : sert de clé React et d'ancre dans les tests. */
  cle: string;
  titre: string;
  /** L'humeur de Mico sur cet écran. */
  mico: EtatMico;
  blocs: Bloc[];
  /** Secondes à passer sur l'écran avant que « Next » se déverrouille. */
  attente: number;
}

/** Écran « Slack » (2/11) : la règle unique des questions, pour Ruul et Upwork. */
export function ecranSlack(ruul: boolean): Ecran {
  return {
    cle: "slack",
    titre: "Questions & Slack",
    mico: "wave",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "titre", texte: "1. A QUESTION OR A PROBLEM? CLICK HELP." },
      { type: "liste", items: [REGLE_HELP, regleSlack(ruul), REGLE_ARGENT] },
      { type: "rejoindreSlack" },
      { type: "alerte", ton: "orange", items: ["**Please make sure you join Slack**, with your **full name**."] },
    ],
  };
}

/** Écran « Payments » (3/11), Upwork : la paie par milestone, chaque semaine. */
export function ecranPaiementsUpwork(): Ecran {
  return {
    cle: "paiements",
    titre: "Payments",
    mico: "happy",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      {
        type: "p",
        texte:
          "You are paid **every week** through an **Upwork milestone** from Vik Studios. **Nothing to submit**: every Monday, we pay you for the week of posts that just ended (Monday → Sunday).",
      },
      { type: "alerte", ton: "orange", items: [REGLE_ARGENT] },
    ],
  };
}

/** Ce que l'écran « Your first week » sait du posteur. */
export interface PremiereSemaine {
  handle: string | null;
  /** « Monday 16 November » : le jour du 1er post. */
  premierPost: string | null;
  /** « Monday 23 November » : le 1er paiement (le lundi après la 1re semaine de posts). */
  premierPaiement?: string | null;
  /** Le montant de SA semaine (sa zone), en dollars : seulement sur son propre dashboard. */
  montantSemaine?: number | null;
  ruul?: boolean;
}

/**
 * « Your first week, step by step » (chantier du 28 oct., partie G ; 13/11 : l'étape Ruul et le
 * 1er paiement). Le @, le jour du 1er post et du 1er paiement viennent du posteur quand on les
 * connaît, sinon le texte renvoie au tableau de bord.
 */
export function ecranCompte(handle: string | null, premierPost: string | null, o: Omit<PremiereSemaine, "handle" | "premierPost"> = {}): Ecran {
  const arobase = handle ? `@${handle.replace(/^@/, "")}` : null;
  const etapes: { quand: string; titre: string; texte?: string }[] = [
    { quand: "Done", titre: "Log in", texte: "You're in: your dashboard has everything you need." },
    {
      quand: "Today",
      titre: "Join Slack",
      texte: "Join with your **full name**. **Please make sure you join Slack.**",
    },
    {
      quand: "Today",
      titre: arobase ? `Create your TikTok account ${arobase}` : "Create your TikTok account",
      texte: `With an email address of your choice. Use the ${arobase ? `handle **${arobase}**` : "handle"}, bio and profile picture from your dashboard, **exactly as provided**.`,
    },
    {
      quand: "Before Sunday midnight",
      titre: "Start warmup + follow 5 accounts",
      texte:
        "Press **“Start warmup”** on your dashboard, then follow **5 accounts** in your niche. Until your first post, use TikTok every day and **do not post anything**.",
    },
  ];
  if (o.ruul) {
    etapes.push({
      quand: "Before Sunday midnight",
      titre: "Prepare your Ruul account",
      texte: "Invitation email from Ruul → verify your ID → add your bank account → click **It's done** on your dashboard.",
    });
  }
  etapes.push({
    quand: premierPost ? premierPost : "Next Monday (the date is on your dashboard)",
    titre: "Your first post",
    texte: "Your slideshows arrive on the platform, **with your cohort**. Post, then paste the link on your dashboard the same day.",
  });
  const jourPaie = o.premierPaiement ?? null;
  etapes.push(
    o.ruul
      ? {
        quand: jourPaie ?? "The Monday after your first week",
        titre: `Your first payment: ${jourPaie ?? "the Monday after your first week"}${o.montantSemaine ? `, ${o.montantSemaine} $ for your first week` : ""}`,
        texte: "Through Ruul, for your first week of posts (Monday → Sunday). Nothing to submit.",
      }
      : {
        quand: jourPaie ?? "The Monday after your first week",
        titre: `Your first payment: ${jourPaie ?? "the Monday after your first week"}, via your Upwork milestone`,
        texte: "For your first week of posts (Monday → Sunday). Nothing to submit.",
      },
  );
  return {
    cle: "compte",
    titre: "Your first week, step by step",
    mico: "think",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "frise", items: etapes.map((e, i) => ({ ...e, titre: `${i + 1}. ${e.titre}` })) },
      { type: "regle", regle: "warmup" },
      { type: "regle", regle: "lien" },
      {
        type: "alerte",
        ton: "rouge",
        titre: "The warm-up, every day until your first posts",
        items: [
          "Scroll **at least 10 minutes** of videos **in the niche you will post in**.",
          "**Follow at least 5 people**, like and comment.",
          "**Do not post anything yet.**",
        ],
      },
    ],
  };
}

export const ECRANS: Ecran[] = [
  {
    cle: "welcome",
    titre: "Welcome to Vik Studios!",
    mico: "wave",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "alerte", ton: "vif", items: ["PLEASE READ EVERYTHING CAREFULLY."] },
      { type: "p", texte: "Hello, and **welcome to the Vik Studios team**! We are really happy to have you." },
      {
        type: "liste",
        items: [
          "Read **every screen**, to the end.",
          "Watch **the videos**: they show exactly what to do.",
          "A **short quiz** at the end checks the key points.",
        ],
      },
      {
        type: "p",
        texte: "Even if you have already seen some of this in your onboarding documents, **please read it again**.",
      },
    ],
  },
  ecranSlack(false),
  ecranPaiementsUpwork(),
  {
    cle: "plateforme",
    titre: "The platform",
    mico: "think",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "**This platform** is your workspace. Here you will find:" },
      {
        type: "liste",
        items: [
          "**Your slideshows** to post, every day.",
          "**Your account details**: TikTok handle, bio, profile picture.",
        ],
      },
      {
        type: "alerte",
        ton: "orange",
        items: ["**Everything you need is here.** Nothing important is sent by message."],
      },
    ],
  },
  ecranCompte(null, null),
  {
    cle: "posting",
    titre: "Posting your slideshows",
    mico: "surprise",
    attente: ATTENTE_VIDEO_S,
    blocs: [
      {
        type: "alerte",
        ton: "rouge",
        items: [
          "Post the slideshows **exactly as provided**: same images, same order, same text, same sound. Alignment, colour, everything.",
        ],
      },
      { type: "titre", texte: "The routine" },
      {
        type: "etapes",
        items: [
          "Open the platform and find **today's slideshows**.",
          "**Download the images** (easiest on your phone).",
          "On TikTok, start a new post and select the images **in the right order**.",
          "Add the **caption provided**.",
          "Add the **sound provided**.",
          "Check that every slide is **readable** and well formatted.",
          "**Publish.**",
          "**Copy the post link** and paste it **on the platform**.",
        ],
      },
      {
        type: "alerte",
        ton: "rouge",
        titre: "Two common mistakes",
        items: [
          "The sound is **not your choice**: use the one on the platform.",
          "The link goes **on the platform**, not in Slack. That is how we know you posted.",
        ],
      },
      { type: "regle", regle: "lien" },
      { type: "titre", texte: "Watch the demo carefully" },
      {
        type: "p",
        texte: "**Really watch it, until the end.** It shows every step above, on a real post.",
      },
      { type: "video", src: LOOM_EMBED, titre: "How to post TikTok slideshows" },
      {
        type: "lien",
        avant: "Something missing? The guide has FAQs and extra instructions:",
        libelle: "Vik Studios TikTok Poster Guide",
        href: LIEN_GUIDE,
      },
    ],
  },
  {
    cle: "timing",
    titre: "When to post",
    mico: "think",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "**Twice a day, every day.**" },
      {
        type: "liste",
        items: [
          "**Spread out**: for example once in the morning, once in the evening.",
          "At **peak hours** in your country's time zone.",
          "At **roughly the same times** each day.",
        ],
      },
      { type: "p", texte: "**Consistency** matters more than the perfect minute." },
      {
        type: "alerte",
        ton: "orange",
        items: ["After each post: **paste its link on the platform**."],
      },
    ],
  },
  {
    cle: "warmup",
    titre: "Your warm-up: do it now",
    mico: "surprise",
    attente: ATTENTE_WARMUP_S,
    blocs: [
      {
        type: "alerte",
        ton: "vif",
        titre: "VERY IMPORTANT: WARM UP YOUR ACCOUNT BEFORE YOU START POSTING!!!",
        items: [
          "**At least 10 minutes** of scrolling, in your niche.",
          "**Follow at least 5 people.**",
          "**If you do not do it, you will not be paid.**",
        ],
      },
      {
        type: "p",
        texte:
          "**Do it as soon as possible**: today, right after creating your account. Then keep using TikTok like this **every day** until your first posts.",
      },
      {
        type: "p",
        texte: "You **start posting next Monday**, with your cohort. Your date is on your dashboard.",
      },
      { type: "titre", texte: "Watch: the warm-up, step by step" },
      {
        type: "video",
        src: VIDEO_WARMUP,
        image: VIDEO_WARMUP_IMAGE,
        titre: "The warm-up, step by step",
        fichier: true,
      },
    ],
  },
  {
    cle: "sans-warmup",
    titre: "No warm-up = no pay",
    mico: "sad",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      {
        type: "alerte",
        ton: "vif",
        items: [
          "If you do **not** warm up your account before next Monday, you start posting anyway, and your account gets **shadowbanned**: **you will receive NO monetary compensation.**",
        ],
      },
      {
        type: "p",
        texte:
          "**Why?** TikTok treats a brand-new account that posts straight away like a robot. Its posts get **0 views**: that is a shadowban, and those posts are worth nothing to us.",
      },
      {
        type: "etapes",
        items: [
          "**First**, warm up your account: every day, until next Monday.",
          "**Then**, from Monday, post your slideshows.",
        ],
      },
      { type: "p", texte: "**Never the other way round.**" },
    ],
  },
  {
    cle: "fin",
    titre: "That's it!",
    mico: "celebrate",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "We hope everything was clear. **Anything unclear? Click Help on your dashboard.**" },
      {
        type: "p",
        texte: "Thank you for everything, and good luck! **We are building something great.**",
      },
      { type: "p", texte: "Bye bye! Maximilien ;)" },
      {
        type: "lien",
        avant: "Any other question:",
        libelle: "Vik Studios TikTok Poster Guide",
        href: LIEN_GUIDE,
      },
    ],
  },
];

export interface Question {
  cle: string;
  question: string;
  /** Les réponses, dans l'ordre d'affichage. */
  options: string[];
  /** Index de la bonne réponse dans `options`. */
  bonne: number;
  /** `Ecran.cle` à relire quand la réponse est fausse. */
  ecran: string;
}

/**
 * Sept questions : celles dont l'oubli coûte réellement quelque chose. Le
 * minuteur force à attendre, le quiz force à lire — c'est lui le vrai verrou.
 * La cohorte Ruul a ses propres réponses pour le Slack et la paie
 * (`questionsPour`).
 */
export const QUESTIONS: Question[] = [
  {
    cle: "son",
    question: "Which sound do you use on your post?",
    options: [
      "Whichever sound is trending that day",
      "The one provided on the platform",
      "No sound at all",
    ],
    bonne: 1,
    ecran: "posting",
  },
  {
    cle: "lien",
    question: "You have just published a post. Where do you paste its link?",
    options: [
      "On the platform, on the post's card",
      "In your country's Slack channel",
      "You send it in a Slack DM",
    ],
    bonne: 0,
    ecran: "posting",
  },
  {
    cle: "frequence",
    question: "How many times a day do you post?",
    options: ["Once a day", "As many times as you want", "Twice a day, spread out"],
    bonne: 2,
    ecran: "timing",
  },
  {
    cle: "warmup",
    question: "What do you do during your warmup?",
    options: [
      "Post your first slideshow straight away",
      "At least 10 minutes of scrolling in your niche, follow at least 5 people, and no posting yet",
      "Nothing at all, you just wait",
    ],
    bonne: 1,
    ecran: "warmup",
  },
  {
    cle: "paye-sans-warmup",
    question: "Will I be paid if I start posting without warming up my account?",
    options: ["Yes", "No"],
    bonne: 1,
    ecran: "sans-warmup",
  },
  {
    cle: "question",
    question: "If I have a question, what do I do?",
    options: ["I DM the CEO", "I ask Help in the Sophia OS", "I ask anybody"],
    bonne: 1,
    ecran: "slack",
  },
  {
    cle: "paiement",
    question: "I have an issue regarding a payment. What do I do?",
    options: [
      "I post about it in a Slack channel",
      "I ask Help in the OS; if it's really a problem, I DM Maximilien Kender on Slack",
      "I wait for the next payment",
    ],
    bonne: 1,
    ecran: "paiements",
  },
];

/**
 * Ce que l'accueil sait du créateur. Les posters venus du site (Sophia Culture
 * Hub) forment la « cohorte Ruul » : pas de HM, payés chaque semaine par Ruul,
 * suivis dans un salon Slack à part. Leur accueil diffère sur deux écrans.
 */
export interface ContexteAccueil {
  cohorteRuul: boolean;
  /** L'adresse donnée sur le site : celle de leur compte Ruul. */
  emailRuul: string | null;
  /** Prénom et nom de la pièce d'identité, déjà donnés (pour l'ajout dans Ruul). */
  identite?: { prenom: string; nom: string } | null;
  /** Lundi de démarrage (AAAA-MM-JJ) : fin du warm-up, premiers posts, premier paiement. */
  debutLe?: string | null;
  /** Le @ TikTok à créer et le jour du 1er post (« Monday 2 November »), pour les étapes. */
  handle?: string | null;
  premierPost?: string | null;
  /** 13/11 : le jour du 1er paiement et le montant de SA semaine (Ruul). */
  premierPaiement?: string | null;
  montantSemaine?: number | null;
}

function ecransCohorteRuul(emailRuul: string | null): Record<string, Ecran> {
  return {
    slack: ecranSlack(true),
    paiements: {
      cle: "paiements",
      titre: "Payments",
      mico: "happy",
      attente: ATTENTE_TEXTE_S,
      blocs: [
        {
          type: "p",
          texte:
            "You are paid **every week** through **Ruul**, our payment partner. **Nothing to submit**: every Monday, we pay you for the week of posts that just ended (Monday → Sunday).",
        },
        { type: "titre", texte: "Before your first Monday" },
        {
          type: "etapes",
          items: [
            `Within 24 hours you'll receive an **invitation email from Ruul**. Create your account **FROM that email**, with this address: **${emailRuul ?? "the email address you applied with"}**.`,
            "Verify your **ID** (ID and selfie, about 10 minutes).",
            "Add your **bank account**.",
            "Then click **It's done** on your dashboard.",
          ],
        },
        {
          type: "alerte",
          ton: "orange",
          titre: "Same email address",
          items: ["If you create your Ruul account with another email address, **we cannot pay you**."],
        },
        { type: "alerte", ton: "orange", items: [REGLE_ARGENT] },
        { type: "identite" },
      ],
    },
  };
}

/**
 * Les écrans à montrer à ce créateur. Même nombre d'écrans dans tous les cas
 * (la reprise et le compteur d'étapes s'appuient sur `ECRANS.length`) : la
 * cohorte Ruul remplace des écrans, elle n'en ajoute pas.
 */
export function ecransPour(contexte: ContexteAccueil | null | undefined): Ecran[] {
  const ruul = Boolean(contexte?.cohorteRuul);
  const compte = ecranCompte(contexte?.handle ?? null, contexte?.premierPost ?? null, {
    ruul, premierPaiement: contexte?.premierPaiement ?? null, montantSemaine: contexte?.montantSemaine ?? null,
  });
  const remplacants: Record<string, Ecran> = { compte, ...(ruul ? ecransCohorteRuul(contexte?.emailRuul ?? null) : {}) };
  return ECRANS.map((e) => remplacants[e.cle] ?? e);
}

/** 13/11 : les mêmes questions pour tous (la règle des questions est la même pour Ruul et Upwork). */
export function questionsPour(contexte?: ContexteAccueil | null): Question[] {
  void contexte;
  return QUESTIONS;
}
