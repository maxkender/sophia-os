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

/** Attente par défaut d'un écran de texte, en secondes. */
export const ATTENTE_TEXTE_S = 8;

/** Le guide complet, pour toute question qui dépasse cet accueil. */
export const LIEN_GUIDE =
  "https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";

/** Invitation Slack de l'espace de travail. */
export const LIEN_SLACK =
  "https://join.slack.com/t/sophia-system/shared_invite/zt-4dusa2eyo-6_CjWI3ylCGdlAqA8737Ew";

/** Le salon des posters venus du site, qui n'ont pas de HM. */
export const SALON_COHORTE_RUUL = "#ruul-cohort";

/** Le salon d'accueil, que les posters venus du site rejoignent aussi. */
export const SALON_BIENVENUE = "#welcome";

/** Page d'inscription freelancer de Ruul (paie de la cohorte Ruul). */
export const LIEN_RUUL_INSCRIPTION = "https://app.ruul.io/register";

import type { EtatMico } from "./Mico";

export type Bloc =
  | { type: "p"; texte: string }
  | { type: "liste"; items: string[] }
  | { type: "etapes"; items: string[] }
  | { type: "titre"; texte: string }
  | { type: "alerte"; ton: "rouge" | "orange"; titre?: string; items: string[] }
  | { type: "video"; src: string; titre: string }
  | { type: "lien"; avant?: string; libelle: string; href: string }
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
      { type: "p", texte: "Hello! Welcome to the Vik Studios team!" },
      {
        type: "p",
        texte:
          "Please read carefully through this onboarding and watch the video. You may have already seen some of this in the onboarding documents, but we kindly ask you to read through it thoroughly.",
      },
      {
        type: "p",
        texte:
          "We are really delighted to welcome you onboard, and we hope that our collaboration will be seamless.",
      },
      { type: "p", texte: "Let's get started!" },
    ],
  },
  {
    cle: "mission",
    titre: "Our mission",
    mico: "happy",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      {
        type: "p",
        texte:
          "We are a mobile app studio called Vik Studios, and our goal is to put our apps in front of millions of people online, to help them improve their lives with our products. We have built more than 5 apps (general knowledge, health and fitness, and more) across more than 40 countries.",
      },
      {
        type: "p",
        texte: "That is why we need your help to turn our vision and mission into reality!",
      },
    ],
  },
  {
    cle: "slack",
    titre: "Slack",
    mico: "wave",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "First thing: all communication happens on Slack." },
      {
        type: "p",
        texte:
          "You will be invited to your country's channel. Ask all your questions there, whether you hit a problem (technical, payment) or simply want to chat and connect with other members of the Vik Studios team.",
      },
      { type: "lien", avant: "Not in yet?", libelle: "Join the Slack workspace", href: LIEN_SLACK },
    ],
  },
  {
    cle: "paiements",
    titre: "Payments",
    mico: "happy",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "Payments are handled directly by your hiring manager." },
      {
        type: "p",
        texte:
          "Anything about money goes to them, on Slack. They are the right person, and the fastest one.",
      },
    ],
  },
  {
    cle: "plateforme",
    titre: "The platform",
    mico: "think",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      { type: "p", texte: "The Vik Studios platform you are on right now." },
      {
        type: "p",
        texte:
          "This is where the creatives and everything about your posting mission live. You will find your posts and your account information here: TikTok handle, bio, profile picture.",
      },
      {
        type: "alerte",
        ton: "orange",
        items: ["Everything you need to post is here. Nothing important is sent by message."],
      },
    ],
  },
  {
    cle: "compte",
    titre: "Setting up your account",
    mico: "think",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      {
        type: "p",
        texte:
          "You create the account yourself, with an email address of your choice. Everything you need is provided on your dashboard on this platform.",
      },
      { type: "p", texte: "Please use all the information we provide, exactly as provided." },
      {
        type: "p",
        texte:
          "When everything is set up, press “Start warmup”. That tells us you have started warming up your account, so we can track it.",
      },
      {
        type: "alerte",
        ton: "orange",
        titre: "The next 24 hours",
        items: [
          "Scroll through a few videos, about 5 minutes, IN THE NICHE YOU WILL BE POSTING IN.",
          "Follow a few people, leave comments, repost.",
          "This is important. Do not post anything yet.",
        ],
      },
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
          "You publish the slideshows exactly as they are provided. You download the images, you copy the text, and you post them like the reference images: alignment, colour, everything.",
        ],
      },
      { type: "titre", texte: "The routine" },
      {
        type: "etapes",
        items: [
          "Open the platform and find today's slideshows.",
          "Download the images (easiest on your phone).",
          "On TikTok, start a new post and select the images in the correct order.",
          "Add the caption provided.",
          "Add the sound provided.",
          "Check every slide is readable and well formatted.",
          "Publish.",
          "Copy the post link and paste it on the platform.",
        ],
      },
      {
        type: "alerte",
        ton: "rouge",
        titre: "Two common mistakes",
        items: [
          "The sound is not your choice. Use the one on the system.",
          "The link goes on the platform, not in Slack. That is how we know you posted.",
        ],
      },
      { type: "titre", texte: "Timing" },
      {
        type: "liste",
        items: [
          "Twice a day, spread out, for example morning and evening.",
          "At peak hours in your country's time zone.",
          "At roughly the same times each day.",
        ],
      },
      { type: "p", texte: "Consistency matters more than the perfect minute." },
      { type: "titre", texte: "Watch the demo" },
      { type: "video", src: LOOM_EMBED, titre: "How to post TikTok slideshows" },
      {
        type: "lien",
        avant: "If anything is missing, check the guide for FAQs and extra instructions.",
        libelle: "Vik Studios TikTok Poster Guide",
        href: LIEN_GUIDE,
      },
      {
        type: "alerte",
        ton: "orange",
        items: ["Do not forget to paste your links once you have posted!"],
      },
    ],
  },
  {
    cle: "fin",
    titre: "That's it!",
    mico: "celebrate",
    attente: ATTENTE_TEXTE_S,
    blocs: [
      {
        type: "p",
        texte:
          "We hope everything was clear. If anything is unclear, feel free to ask any question on Slack.",
      },
      {
        type: "p",
        texte:
          "We hope everything goes well for you, and we thank you for everything. We are building something great.",
      },
      { type: "p", texte: "Bye bye! Maximilien ;)" },
      {
        type: "lien",
        avant: "If you have any other questions:",
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
 * Quatre questions, et seulement quatre : celles dont l'oubli coûte
 * réellement quelque chose. Le minuteur force à attendre, le quiz force à
 * lire — c'est lui le vrai verrou.
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
    ecran: "posting",
  },
  {
    cle: "warmup",
    question: "What do you do during your warmup?",
    options: [
      "Post your first slideshow straight away",
      "Scroll about 5 minutes in your niche, follow, comment and repost, without posting yet",
      "Nothing at all, you just wait",
    ],
    bonne: 1,
    ecran: "compte",
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
        { type: "p", texte: "First thing: all communication happens on Slack." },
        {
          type: "p",
          texte:
            `Join the ${SALON_BIENVENUE} and ${SALON_COHORTE_RUUL} channels. Ask all your questions in ${SALON_COHORTE_RUUL}, whether you hit a problem (technical, payment) or simply want to chat and connect with the Vik Studios team.`,
        },
        { type: "lien", avant: "Not in yet?", libelle: "Join the Slack workspace", href: LIEN_SLACK },
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
            "You are paid every week through Ruul (ruul.io), our payment partner. Nothing to submit: every Monday, we pay you for the week of posts that just ended (Monday → Sunday). Your first payment date is shown on your calendar.",
        },
        { type: "titre", texte: "Before your first Monday" },
        {
          type: "etapes",
          items: [
            emailRuul
              ? `Create your free freelancer account on ruul.io with this email address: ${emailRuul}.`
              : "Create your free freelancer account on ruul.io with the email address you applied with.",
            "Complete the identity check (ID and selfie, about 10 minutes).",
            "Add your bank account in Ruul.",
          ],
        },
        { type: "lien", avant: "Start here:", libelle: "Create my Ruul account", href: LIEN_RUUL_INSCRIPTION },
        {
          type: "alerte",
          ton: "orange",
          titre: "Same email address",
          items: ["If you sign up on Ruul with another email address, we cannot pay you."],
        },
        {
          type: "p",
          texte: `Questions about money: send a direct message on Slack to the team running ${SALON_COHORTE_RUUL}, never in the channel.`,
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
