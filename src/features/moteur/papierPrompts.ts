/** Assemblage des prompts Papier (copie miroir de supabase/functions/_shared/papier_prompts.ts). */

import {
  CLE_PROMPT_SCRIPT,
  LABEL_NARRATION_STYLE,
  PROMPTS_PAPIER_DEFAUT,
} from "./papierPromptDefauts";
import type { PapierKind, PapierNarrationStyle } from "./papierScript";
import { CATEGORIE_BRIEF, type PapierCategorie } from "./papierSujets";

export function libelleNarrationStyle(style: PapierNarrationStyle): string {
  return LABEL_NARRATION_STYLE[style] ?? LABEL_NARRATION_STYLE.revelation;
}

const KIND_BRIEF: Record<PapierKind, string> = {
  faits: "Sujet : un fait fascinant, surprenant et vérifiable.",
  culture: "Sujet : culture générale, pédagogique mais captivant.",
  pub: "Sujet : un fait fascinant. Sophia n'est nommée qu'une fois, dans le CTA.",
};

export function scriptSystemPrompt(
  kind: PapierKind,
  sceneCount: number,
  style: PapierNarrationStyle,
  wordsPerScene: number,
  totalWords: number,
  extras: {
    doctrine: string;
    cta: string;
    voix: string;
    imageStyle: string;
    categorie?: PapierCategorie;
    langName?: string;
  },
): string {
  const lo = Math.max(10, Math.round(wordsPerScene - 2));
  const hi = Math.min(28, Math.round(wordsPerScene + 4));
  const langName = extras.langName ?? "français de France";
  const categorie = extras.categorie ?? "aleatoire";
  return [
    extras.doctrine.trim() || PROMPTS_PAPIER_DEFAUT[CLE_PROMPT_SCRIPT],
    "",
    `NARRATION_STYLE = "${libelleNarrationStyle(style)}"`,
    `DOMAINE : ${CATEGORIE_BRIEF[categorie] ?? CATEGORIE_BRIEF.aleatoire}`,
    KIND_BRIEF[kind],
    `LANGUE DE SORTIE : tous les textes lus ou affichés (title, hook, narration, overlay, cta, hashtags) sont en ${langName}. Seuls imagePrompt et videoPrompt restent en anglais.`,
    `ÉTAPE ACTIVE : 2 et 3 — SCRIPT + DÉCOUPAGE EN PLANS.`,
    `Produis exactement ${sceneCount} scènes (hors CTA, le CTA va dans le champ cta).`,
    `DURÉE : le script complet (scènes + CTA) fait environ ${totalWords} mots (± 5 %). Chaque narration : ${lo} à ${hi} mots.`,
    "Le champ hook reprend exactement le texte de la scène 1.",
    "Le champ overlay : 3 à 6 mots, percutant (ne pas écrire la couleur).",
    extras.voix.trim(),
    extras.cta.trim(),
    "COHÉRENCE VISUELLE : remplis characters (description physique FIXE en anglais) et palette (4 à 5 couleurs).",
    "Dans CHAQUE imagePrompt et videoPrompt, recopie mot pour mot la description du personnage. Jamais « the same man ».",
    "CORRESPONDANCE TEXTE–IMAGE : l'image illustre LITTÉRALEMENT la narration. 1 à 3 éléments, silhouette claire, aucun texte dans l'image.",
    "videoPrompt : action simple, caméra VERROUILLÉE. Seuls les papiers bougent. 8 secondes max.",
    "N'utilise JAMAIS de noms protégés (films, marques, artistes) dans imagePrompt / videoPrompt : décris ce qu'on voit.",
    "DIRECTION ARTISTIQUE (à appliquer à chaque imagePrompt et videoPrompt) :",
    extras.imageStyle.trim(),
    'Réponds uniquement en JSON: {"title":string,"hook":string,"characters":[{"name":string,"description":string}],"palette":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"hashtags":string[]}',
  ].join("\n");
}

export function topicSystemPrompt(
  style: PapierNarrationStyle,
  recents: string[],
  seed: string,
  categorie: PapierCategorie = "aleatoire",
  doctrine?: string,
): string {
  const exclus = recents.filter(Boolean).slice(0, 12);
  return [
    doctrine?.trim() || PROMPTS_PAPIER_DEFAUT[CLE_PROMPT_SCRIPT],
    "",
    "ÉTAPE ACTIVE : 1 — TROUVER LE SUJET. Ne rédige pas le script.",
    `NARRATION_STYLE = "${libelleNarrationStyle(style)}"`,
    `DOMAINE OBLIGATOIRE : ${CATEGORIE_BRIEF[categorie] ?? CATEGORIE_BRIEF.aleatoire}`,
    "LANGUE DE SORTIE : français de France.",
    `Graine d'aléatoire (ne la mentionne jamais) : ${seed}. Ne propose pas l'exemple le plus évident du domaine.`,
    exclus.length ? `N'utilise PAS ces sujets déjà traités : ${exclus.join(" · ")}.` : "",
    'Réponds uniquement en JSON: {"topic": string}',
  ]
    .filter(Boolean)
    .join("\n");
}
