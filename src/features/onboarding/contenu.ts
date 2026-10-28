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
export const LIEN_GUIDE =
  "https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";

/** Invitation Slack de l'espace de travail. */
export const LIEN_SLACK =
  "https://join.slack.com/t/sophia-system/shared_invite/zt-4ef0h51pi-utjxbNZ7ArY_6iwy3DWazA";

/** Le salon où les posters posent leurs questions. */
export const SALON_QUESTIONS = "#questions";

/** À qui écrire quand un paiement bloque et que la HM ne répond pas. */
export const CONTACTS_PAIEMENT = "Lucia De Mojà or Maximilien Kender";

/** Le salon des posters venus du site, qui n'ont pas de HM. */
export const SALON_COHORTE_RUUL = "#ruul-questions";

/** Le salon d'accueil, que les posters venus du site rejoignent aussi. */
export const SALON_BIENVENUE = "#welcome";

/** Page d'inscription freelancer de Ruul (paie de la cohorte Ruul). */
export const LIEN_RUUL_INSCRIPTION = "https://app.ruul.io/register";

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
  /** « Join Slack » : le lien du réglage `slack_lien_invitation`, sinon `LIEN_SLACK`. */
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
  {
    cle: "slack",
    titre: "Slack",
    mico: "wave",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "titre", texte: "1. JOIN SLACK (RECOMMENDED)" },
      {
        type: "p",
        texte: "Join with your **full name**: that's where you get news and answers to your questions.",
      },
      { type: "rejoindreSlack" },
      { type: "alerte", ton: "orange", items: [`Any question? Ask it in **${SALON_QUESTIONS}** on Slack.`] },
    ],
  },
  {
    cle: "paiements",
    titre: "Payments",
    mico: "happy",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "You're paid **every Monday on Upwork by Vik Studios**." },
      {
        type: "etapes",
        items: [`Any issue with a payment: **send a direct message to ${CONTACTS_PAIEMENT}** on Slack.`],
      },
    ],
  },
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
  {
    cle: "compte",
    titre: "Setting up your account",
    mico: "think",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "Your **first week**, step by step:" },
      {
        type: "frise",
        items: [
          {
            quand: "Today",
            titre: "Create your TikTok account",
            texte:
              "With an email address of your choice. Use the handle, bio and profile picture from your dashboard, **exactly as provided**.",
          },
          {
            quand: "Right after",
            titre: "Press “Start warmup”",
            texte: "On your dashboard. It tells us you have started, so we can follow your account.",
          },
          {
            quand: "Every day until Monday",
            titre: "Warm up your account",
            texte: "Use TikTok like a normal person, in your niche. **Do not post anything.**",
          },
          {
            quand: "Next Monday",
            titre: "Your first posts",
            texte: "Your slideshows arrive on the platform, **with your cohort**. You start posting.",
          },
        ],
      },
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
      { type: "regle", regle: "warmup" },
    ],
  },
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
      { type: "p", texte: "We hope everything was clear. **Anything unclear? Ask on Slack.**" },
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
      "You send it to your hiring manager",
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
    options: ["I DM the CEO on Slack", `I ask in ${SALON_QUESTIONS} on Slack`, "I ask anybody"],
    bonne: 1,
    ecran: "slack",
  },
  {
    cle: "paiement",
    question: "I have an issue regarding a payment. What do I do?",
    options: [
      "I post about it in my country's channel",
      `I message my hiring manager on Slack. No answer? I DM ${CONTACTS_PAIEMENT}`,
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
}

function ecransCohorteRuul(emailRuul: string | null): Record<string, Ecran> {
  return {
    slack: {
      cle: "slack",
      titre: "Slack",
      mico: "wave",
      attente: ATTENTE_TEXTE_S,
      blocs: [
        { type: "titre", texte: "1. ALL COMMUNICATION HAPPENS ON SLACK." },
        {
          type: "p",
          texte:
            `Join the **${SALON_BIENVENUE}** and **${SALON_COHORTE_RUUL}** channels. Ask **all your questions in ${SALON_COHORTE_RUUL}**: a technical problem, a payment question, or just to chat with the team.`,
        },
        { type: "lien", avant: "**If you are not in it yet:**", libelle: "here is the link", href: LIEN_SLACK },
      ],
    },
    paiements: {
      cle: "paiements",
      titre: "Payments",
      mico: "happy",
      attente: ATTENTE_TEXTE_S,
      blocs: [
        {
          type: "p",
          texte:
            "You are paid **every week** through **Ruul** (ruul.io), our payment partner. **Nothing to submit**: every Monday, we pay you for the week of posts that just ended (Monday → Sunday). Your first payment date is on your calendar.",
        },
        { type: "titre", texte: "Before your first Monday" },
        {
          type: "etapes",
          items: [
            emailRuul
              ? `Create your free freelancer account on ruul.io with **this email address: ${emailRuul}**.`
              : "Create your free freelancer account on ruul.io with **the email address you applied with**.",
            "Complete the **identity check** (ID and selfie, about 10 minutes).",
            "Add your **bank account** in Ruul.",
          ],
        },
        { type: "lien", avant: "Start here:", libelle: "Create my Ruul account", href: LIEN_RUUL_INSCRIPTION },
        {
          type: "alerte",
          ton: "orange",
          titre: "Same email address",
          items: ["If you sign up on Ruul with another email address, **we cannot pay you**."],
        },
        {
          type: "p",
          texte: `Questions about money: send a **direct message** on Slack to the team running ${SALON_COHORTE_RUUL}, **never in the channel**. No answer? DM **${CONTACTS_PAIEMENT}**.`,
        },
        { type: "identite" },
      ],
    },
  };
}

/**
 * Les écrans à montrer à ce créateur. Même nombre d'écrans dans tous les cas
 * (la reprise et le compteur d'étapes s'appuient sur `ECRANS.length`) : la
 * cohorte Ruul remplace deux écrans, elle n'en ajoute pas.
 */
export function ecransPour(contexte: ContexteAccueil | null | undefined): Ecran[] {
  if (!contexte?.cohorteRuul) return ECRANS;
  const remplacants = ecransCohorteRuul(contexte.emailRuul);
  return ECRANS.map((e) => remplacants[e.cle] ?? e);
}

/**
 * Les questions du quiz pour ce créateur. La cohorte Ruul n'a pas de HM et
 * pose ses questions dans son salon : ces deux réponses changent.
 */
export function questionsPour(contexte: ContexteAccueil | null | undefined): Question[] {
  if (!contexte?.cohorteRuul) return QUESTIONS;
  const remplacantes: Record<string, Partial<Question>> = {
    question: {
      options: ["I DM the CEO on Slack", `I ask in ${SALON_COHORTE_RUUL} on Slack`, "I ask anybody"],
    },
    paiement: {
      options: [
        "I post about it in the channel",
        `I DM the team running ${SALON_COHORTE_RUUL} on Slack. No answer? I DM ${CONTACTS_PAIEMENT}`,
        "I wait for the next payment",
      ],
    },
  };
  return QUESTIONS.map((q) => (remplacantes[q.cle] ? { ...q, ...remplacantes[q.cle] } : q));
}
