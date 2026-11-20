/**
 * Le questionnaire « top posters » : une seule définition, lue par le formulaire public, la page admin (tableau,
 * CSV), le pop-up et la fonction questionnaire (bonus : questionnaire terminé). Textes en anglais (la source) ;
 * affichés dans la langue du posteur par la traduction (action « textes »). Jamais « bot » ni « AI ».
 * 15/11 (Max) : la première version. 20/11 (Max) : bonus de 5 $, section « Your daily posting routine »,
 * Q13 (scroll) et Q16 (comment) précisées, au moins une capture pour terminer.
 */

export type TypeQuestion = "choix" | "multi" | "texte" | "long" | "pays" | "capture";

export interface Question {
  id: string;
  /** Numéro affiché (1, 2, 12a…). */
  n: string;
  texte: string;
  type: TypeQuestion;
  options?: readonly string[];
  optionnel?: boolean;
  /** Une aide sous la question. */
  aide?: string;
  /** Texte : le nombre de caractères minimum. */
  min?: number;
  /** Un champ texte en plus (ex. la ville après le pays). */
  detail?: { id: string; libelle: string };
  /** Question posée seulement si la réponse à `question` est l'une de `valeurs`. */
  si?: { question: string; valeurs: readonly string[] };
  /** Mini-guide pour les captures. */
  guide?: string;
}

export interface Section {
  id: string;
  titre: string;
  questions: readonly Question[];
}

export const SLUG_TOP_POSTERS = "top-posters";

/** 20/11 (Max) : le titre du pop-up et la première ligne du questionnaire. */
export const ACCROCHE_BONUS = "Hey! You'll get a $5 bonus for answering this (about 5 minutes).";

export const INTRO =
  "We'd like to understand what you do on your account, so we can help everyone do as well. Your answers stay private. Questions marked (optional) can be skipped.";

export const MERCI = "Thank you!";

/** 20/11 : réponse cachée posée par le lien du pop-up : le nombre de comptes actifs du posteur (« 1 », « 2 »). */
export const NB_COMPTES = "nb_comptes";

const OUI_SCROLL = ["Yes, less than 15 min a day", "15–30 min", "30–60 min", "More than 1 h"] as const;

export const SECTIONS: readonly Section[] = [
  {
    id: "vous",
    titre: "About you",
    questions: [
      { id: "genre", n: "1", texte: "Gender", type: "choix", options: ["Woman", "Man", "Prefer not to say"], optionnel: true },
      { id: "age", n: "2", texte: "Age", type: "choix", options: ["under 20", "20–25", "26–30", "31–40", "over 40"], optionnel: true },
      { id: "pays", n: "3", texte: "Country you live in", type: "pays", detail: { id: "ville", libelle: "City" } },
      { id: "niveau_langue", n: "4", texte: "Level in the language of your account", type: "choix", options: ["Native", "Fluent", "Basic", "Not at all"] },
    ],
  },
  {
    id: "telephone",
    titre: "Your phone and connection",
    questions: [
      { id: "telephone", n: "5", texte: "Phone model", type: "texte" },
      { id: "usage_telephone", n: "6", texte: "This phone is used for", type: "choix", options: ["Only this account", "Also my personal phone", "Several TikTok accounts"] },
      { id: "sim", n: "7", texte: "SIM card country", type: "pays", options: ["No SIM"] },
      { id: "internet", n: "8", texte: "Internet on TikTok", type: "choix", options: ["Wi-Fi", "Mobile data", "Both"] },
      { id: "vpn", n: "9", texte: "VPN on TikTok", type: "choix", options: ["Never", "Sometimes", "Always"] },
      { id: "vpn_app", n: "9", texte: "Which VPN app?", type: "texte", si: { question: "vpn", valeurs: ["Sometimes", "Always"] } },
      { id: "vpn_pays", n: "9", texte: "Which VPN country?", type: "pays", si: { question: "vpn", valeurs: ["Sometimes", "Always"] } },
      { id: "region", n: "10", texte: "Phone region setting", type: "pays", detail: { id: "langue_telephone", libelle: "Phone language" } },
      { id: "creation", n: "11", texte: "Account created with", type: "choix", options: ["New email", "Phone number", "Google or Apple login"] },
    ],
  },
  {
    id: "warmup",
    titre: "Your warm-up (before your first post)",
    questions: [
      { id: "warmup_jours", n: "12a", texte: "How many days did your warm-up last?", type: "choix", options: ["1–2", "3–4", "5–7", "More than 7"] },
      { id: "warmup_minutes", n: "12b", texte: "Minutes of scrolling per day", type: "choix", options: ["Less than 15", "15–30", "30–60", "More than 60"] },
      {
        id: "warmup_videos", n: "12c", texte: "What did you watch?", type: "choix",
        options: ["Mostly videos in the account's language", "Mixed", "Mostly my own language", "Didn't pay attention"],
      },
      { id: "warmup_recherche", n: "12d", texte: "Did you search for topics or hashtags?", type: "choix", options: ["No", "Yes"] },
      { id: "warmup_recherche_quoi", n: "12d", texte: "Which ones?", type: "long", si: { question: "warmup_recherche", valeurs: ["Yes"] } },
      {
        id: "warmup_actions", n: "12e", texte: "What did you do?", type: "multi",
        options: ["Like", "Comment", "Follow", "Share", "Save", "Watch videos to the end", "Watch LIVEs"],
      },
      { id: "warmup_suivis", n: "12f", texte: "How many accounts did you follow?", type: "choix", options: ["5", "6–20", "21–50", "More than 50"] },
      { id: "warmup_suivis_type", n: "12g", texte: "What kind of accounts did you follow?", type: "long" },
      { id: "warmup_profil", n: "12h", texte: "Before your first post, did you set", type: "multi", options: ["Picture", "Bio", "Name", "None"] },
      { id: "warmup_poste", n: "12i", texte: "Did you post anything during the warm-up?", type: "choix", options: ["No", "Yes"] },
      { id: "warmup_poste_quoi", n: "12i", texte: "What did you post?", type: "long", si: { question: "warmup_poste", valeurs: ["Yes"] } },
      {
        id: "warmup_fyp", n: "12j", texte: "When your first posts went live, your \"For You\" page was", type: "choix",
        options: ["Mostly the account's topic", "Mixed", "Random", "Don't know"],
      },
    ],
  },
  {
    // 20/11 (Max) : la routine, avant « Your habits ».
    id: "routine",
    titre: "Your daily posting routine",
    questions: [
      {
        id: "montage", n: "13", texte: "How do you put your posts together on TikTok?", type: "long",
        aide: "Which app you use, how you add the photos, the text, the music, the caption, the hashtags, the cover…",
      },
      {
        id: "routine", n: "14", type: "long", min: 50,
        texte: "Describe your whole daily posting routine, step by step, from A to Z. Exactly what you do, in order, from opening your phone to after the post is live.",
      },
      { id: "brouillons", n: "15", texte: "Do you save drafts or post right away?", type: "choix", options: ["Drafts", "Right away", "Both"] },
      { id: "duree_post", n: "16", texte: "How long does one post take you?", type: "choix", options: ["Less than 5 min", "5–10 min", "10–20 min", "More than 20 min"] },
      // 20/11 (Max) : seulement pour un posteur à 2 comptes (le lien du pop-up porte nb_comptes).
      {
        id: "meme_chose", n: "16b", texte: "Do you do the same thing on both accounts? If not, what's different?", type: "long",
        si: { question: NB_COMPTES, valeurs: ["2"] },
      },
    ],
  },
  {
    id: "habitudes",
    titre: "Your habits",
    questions: [
      { id: "scroll", n: "17", texte: "Do you scroll on the account besides posting?", type: "choix", options: ["No", ...OUI_SCROLL] },
      {
        id: "scroll_actions", n: "17", texte: "What do you do while scrolling?", type: "multi",
        options: ["Like", "Comment", "Follow", "Save", "Watch LIVEs", "Search"], si: { question: "scroll", valeurs: OUI_SCROLL },
      },
      { id: "heures", n: "18", texte: "When do you post (local time)?", type: "texte" },
      { id: "rythme", n: "18", texte: "Your two posts", type: "choix", options: ["Both at once", "Spread out"] },
      { id: "changements", n: "19", texte: "Before posting you change", type: "multi", options: ["Music", "Caption", "Hashtags", "Cover", "Nothing"] },
      { id: "musique", n: "19", texte: "How do you choose the music?", type: "long" },
      { id: "commentaires", n: "20", texte: "Do you reply to comments?", type: "choix", options: ["Never", "Sometimes", "Often"] },
      {
        id: "commentaires_comment", n: "20", texte: "If yes, how and when? (pin, reply with video, like…)", type: "long", optionnel: true,
        si: { question: "commentaires", valeurs: ["Sometimes", "Often"] },
      },
      { id: "astuces", n: "21", texte: "Anything else you think helps your views?", type: "long", optionnel: true },
    ],
  },
  {
    id: "captures",
    titre: "Screenshots",
    questions: [
      {
        id: "capture_temps", n: "22", texte: "TikTok screen time, last 7 days", type: "capture",
        guide: "TikTok → Profile → ☰ (top right) → Settings and privacy → Time and well-being → Screen time. Take a screenshot of the last 7 days.",
      },
      {
        id: "capture_audience", n: "23", texte: "TikTok Analytics → Viewers (top countries, gender, age)", type: "capture",
        guide: "TikTok → Profile → ☰ → Creator tools → Analytics → Viewers. Take a screenshot showing top countries, gender and age.",
      },
      {
        id: "capture_abonnements", n: "24", texte: "Your \"Following\" list", type: "capture",
        guide: "TikTok → Profile → tap \"Following\". Take one or two screenshots of the list.",
      },
    ],
  },
];

export type Reponses = Record<string, string | string[] | undefined>;

/** La question est-elle posée, vu les réponses déjà données ? */
export function visible(q: Question, r: Reponses): boolean {
  if (!q.si) return true;
  const v = r[q.si.question];
  return typeof v === "string" && q.si.valeurs.includes(v);
}

export function aReponse(v: Reponses[string]): boolean {
  return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
}

/** La réponse est-elle assez longue (texte avec un minimum de caractères) ? */
export function assezLong(q: Question, v: Reponses[string]): boolean {
  return !q.min || (typeof v === "string" && v.trim().length >= q.min);
}

/** Les questions obligatoires (visibles) d'une section sans réponse (ou trop courte). */
export function manquantes(s: Section, r: Reponses): Question[] {
  return s.questions.filter((q) => visible(q, r) && !q.optionnel && q.type !== "capture" && (!aReponse(r[q.id]) || !assezLong(q, r[q.id])));
}

export const IDS_CAPTURES: readonly string[] = SECTIONS.flatMap((s) => s.questions.filter((q) => q.type === "capture").map((q) => q.id));

/** Le nombre de captures envoyées (toutes questions). */
export function nbCaptures(captures: Record<string, string[] | undefined> | null | undefined): number {
  return IDS_CAPTURES.reduce((t, id) => t + (captures?.[id]?.length ?? 0), 0);
}

/**
 * 20/11 (Max) : terminé = toutes les questions obligatoires (visibles) répondues, et au moins une capture.
 * Seul un questionnaire terminé donne le bonus.
 */
export function complet(r: Reponses, captures: Record<string, string[] | undefined> | null | undefined): boolean {
  return SECTIONS.every((s) => manquantes(s, r).length === 0) && nbCaptures(captures) >= 1;
}

/** Toutes les colonnes (réponses et détails), dans l'ordre : pour le tableau admin et le CSV. */
export function colonnes(): { id: string; libelle: string }[] {
  const out: { id: string; libelle: string }[] = [];
  for (const s of SECTIONS) {
    for (const q of s.questions) {
      out.push({ id: q.id, libelle: `${q.n}. ${q.texte}` });
      if (q.detail) out.push({ id: q.detail.id, libelle: `${q.n}. ${q.detail.libelle}` });
    }
  }
  return out;
}

/** Les ids des réponses écrites librement (traduites en français pour la page admin). */
export function idsTextesLibres(): string[] {
  const out: string[] = [];
  for (const s of SECTIONS) {
    for (const q of s.questions) {
      if (q.type === "texte" || q.type === "long") out.push(q.id);
      if (q.detail) out.push(q.detail.id);
    }
  }
  return out;
}

/** 20/11 : les textes de l'écran (hors questions), en anglais. `{date}` : la date du lundi du bonus. */
export const TEXTES_UI = {
  popup_titre: ACCROCHE_BONUS,
  popup_texte: "We'd like to understand what you do on your account, so we can help everyone do as well. Your answers stay private.",
  popup_plus_tard: "Later",
  popup_repondre: "Answer the questions",
  titre: "A few questions about your account",
  intro: INTRO,
  nom: "First name and last name",
  email: "Email",
  email_aide: "The one you use with us (or for Ruul).",
  tiktok: "Your TikTok @",
  identite_manque: "Please fill in your name, email and TikTok @.",
  etape: "Step {n} of {total}",
  fini: "Done",
  enregistrement: "Saving…",
  enregistre: "Saved ✓",
  pas_enregistre: "Not saved yet (we'll retry)",
  en_anglais: "Show in English",
  en_ma_langue: "Show in my language",
  retour: "Back",
  suivant: "Next",
  envoyer: "Send my answers",
  a_repondre: "Please answer: {liste}",
  trop_court: "Please write a bit more ({min} characters minimum).",
  capture_manque: "Please add at least one screenshot.",
  optionnel: "(optional)",
  choisir: "Choose…",
  capture_envoi: "Uploading…",
  capture_ajouter: "Add another screenshot",
  capture_premiere: "Upload a screenshot",
  capture_recue: "screenshot(s) received: {n}",
  merci: MERCI,
  merci_texte: "Your answers have been sent. You can close this page.",
  merci_bonus: "Thanks! Your $5 bonus will be added to your payment on Monday {date}.",
} as const;

export type CleUi = keyof typeof TEXTES_UI;

/** Toutes les phrases à traduire (questions, options, aides, sections, écran), par clé. L'anglais est la source. */
export function dictionnaireAnglais(): Record<string, string> {
  const d: Record<string, string> = {};
  for (const [k, v] of Object.entries(TEXTES_UI)) d[`ui.${k}`] = v;
  for (const s of SECTIONS) {
    d[`s.${s.id}`] = s.titre;
    for (const q of s.questions) {
      d[`q.${q.id}`] = q.texte;
      if (q.aide) d[`a.${q.id}`] = q.aide;
      if (q.guide) d[`g.${q.id}`] = q.guide;
      if (q.detail) d[`d.${q.id}`] = q.detail.libelle;
      (q.options ?? []).forEach((o, i) => { d[`o.${q.id}.${i}`] = o; });
    }
  }
  return d;
}

/** Les langues écrites de droite à gauche. */
export function droiteAGauche(langue: string | null | undefined): boolean {
  return /^(ar|he|fa|ur)\b/i.test(String(langue ?? ""));
}
