/**
 * Prompts master papier — portés de vid-weaver-wonder (script + papercraft).
 * imagePrompt / videoPrompt restent en anglais ; narration / overlay / CTA en FR.
 */

import type { PapierKind, PapierNarrationStyle } from "./papier_script_core.ts";
import { CATEGORIE_BRIEF, type PapierCategorie } from "./papier_sujets.ts";

export const CTA_BRIEF = [
  "RÈGLE CTA : UNE SEULE phrase courte, 6 à 12 mots, qui nomme Sophia une seule fois et invite à ouvrir l'appli.",
  "Pas de paragraphe, pas de cours de deux minutes, pas de bénéfice long. Une phrase, c'est tout.",
  "RÈGLE ABSOLUE : le mot « Sophia » (jamais « Sofia ») apparaît EXACTEMENT UNE FOIS dans tout le script, uniquement dans le CTA.",
  "Exemples de forme (à ne pas recopier) : « Retrouve ça sur Sophia, c'est gratuit. » / « La suite est sur Sophia, télécharge l'appli. »",
].join("\n");

const KIND_BRIEF: Record<PapierKind, string> = {
  faits:
    "Sujet : un fait fascinant, surprenant et vérifiable, raconté comme une petite enquête claire.",
  culture:
    "Sujet : culture générale par thème (histoire, science, mythologie, espace…), pédagogique mais captivant.",
  pub: "Sujet : un fait fascinant. La marque Sophia n'est nommée qu'une seule fois dans toute la vidéo, dans l'outro finale.",
};

const STYLE_BRIEF: Record<PapierNarrationStyle, string> = {
  question:
    "Style « grande question » : part d'un fait que tout le monde croit connaître, puis pose clairement « mais savez-vous vraiment pourquoi… ? » et répond, cause après cause, sans théâtre.",
  revelation:
    "Style « révélation » : on avance indice par indice, chaque scène ajoute un fait précis, puis un retournement unique explique tout. Phrases nettes, pas de suspense artificiel.",
  storytelling:
    "Style « récit immersif » : on raconte la scène vécue (qui, où, quand), au présent simple. On voit ce que les gens voient. Pas de voix off théâtrale, pas de « imagine ». ",
  listicle:
    "Style « énumération » : une idée forte et surprenante par scène, enchaînées clairement, sans effet de liste scolaire.",
};

export const TOPIC_BRIEF: Record<PapierNarrationStyle, string> = {
  question:
    "Le sujet doit être une GRANDE QUESTION que beaucoup de gens se sont déjà posée sans jamais avoir la réponse. Formule le sujet comme une question simple.",
  revelation:
    "Le sujet doit être une croyance très répandue ou une histoire connue qui cache un retournement : ce que les gens croient est faux, ou l'explication réelle est plus étrange.",
  storytelling:
    "Le sujet doit être une histoire vraie avec des personnages, un lieu et un moment précis, qu'on peut raconter comme une scène vécue.",
  listicle:
    "Le sujet doit être un thème simple qui permet d'enchaîner plusieurs faits surprenants indépendants.",
};

export function scriptSystemPrompt(
  kind: PapierKind,
  sceneCount: number,
  style: PapierNarrationStyle,
  wordsPerScene: number,
  totalWords: number,
  langName = "français de France",
): string {
  const lo = Math.max(10, Math.round(wordsPerScene - 2));
  const hi = Math.min(28, Math.round(wordsPerScene + 4));
  return [
    `Tu es un scénariste de vidéos courtes verticales (TikTok / Reels), spécialisé en culture générale.`,
    `LANGUE DE SORTIE (règle absolue) : tous les textes lus ou affichés (title, hook, narration, overlay, cta, hashtags) sont écrits en ${langName}, dans une langue naturelle et idiomatique — jamais une traduction mot à mot. Seuls imagePrompt et videoPrompt restent en anglais.`,
    KIND_BRIEF[kind],
    STYLE_BRIEF[style],
    `Produis exactement ${sceneCount} scènes (hors CTA, le CTA va dans le champ cta).`,
    `RÈGLE N°0 — DURÉE : le script complet (scènes + CTA) doit faire environ ${totalWords} mots au total, avec une marge de 5 % maximum. Compte les mots avant de répondre.`,
    "RÈGLE N°1 — LE HOOK (la partie la plus importante de tout le TikTok).",
    "Le hook = la scène 1. Il n'est PAS une punchline d'une seconde. Il fait 14 à 28 mots, une ou deux phrases claires, assez longues pour intriguer et donner envie de commenter.",
    "Le hook s'appuie sur quelque chose que le spectateur connaît déjà (lieu, monument, animal, objet du quotidien, personnage ou histoire célèbre). On se représente la scène tout de suite.",
    "Le hook doit faire dire : « attends, c'est pas possible » ou « je savais pas ça » — assez précis pour qu'on ait envie de le répéter à quelqu'un.",
    "Interdits dans le hook : « saviez-vous que », « aujourd'hui », « voici », « dans cette vidéo », « imagine », question molle, chiffre isolé sans image, nom propre inconnu du grand public, pronom sans référent.",
    "Le champ hook reprend exactement le texte de la scène 1.",
    "RÈGLE N°2 — LE SCRIPT DÉCOUD LE HOOK.",
    "Toute la vidéo répond au hook, dans l'ordre, sans trou. Chaque scène apporte l'information qui manquait pour comprendre la précédente. Si on coupe une scène, l'histoire casse : c'est le test.",
    "Dès la scène 2 : qui, où, quand (année ou époque nommée, lieu nommé, protagoniste nommé). Jamais « une armée », « un roi » : toujours le nom.",
    "CLARTÉ : phrases courtes, sujet-verbe-complément, vocabulaire d'un ado de 15 ans. Une idée par scène. Pas de théâtre, pas de « tout bascule » à toutes les lignes, pas de connecteur forcé. On raconte, on n'acte pas.",
    "FIL A → Z : on suit une seule histoire du début à la fin. Avant-dernière scène = l'explication qui permet de reformuler le hook en une phrase. Dernière scène avant CTA = chute qui referme le hook (même image, maintenant comprise).",
    `RÈGLE N°3 — LONGUEUR : chaque narration fait entre ${lo} et ${hi} mots. Compte réellement.`,
    "TEST D'INTELLIGIBILITÉ : relis le script à voix haute comme si tu l'entendais pour la première fois. Aucun saut, aucune ellipse, aucun « il » sans nom juste avant. Si une phrase peut être mal comprise, réécris-la plus simplement.",
    "UN SEUL CTA : uniquement dans le champ cta. Aucune scène ne parle de l'appli, de téléchargement ou de cours.",
    "Le mot « Sophia » une seule fois, uniquement dans le CTA. Jamais « Sofia ».",
    "Ton : oral, naturel, tutoiement, précis, concis. Zéro emoji. Zéro jargon.",
    "Le champ overlay : 3 à 6 mots, percutant, blanc à l'écran (ne pas écrire la couleur).",
    "RÈGLE N°4 — COHÉRENCE VISUELLE :",
    "Avant les scènes, remplis characters : chaque personnage / animal / objet récurrent a une description physique FIXE en anglais (âge, silhouette, vêtements, couleurs exactes).",
    "Le champ palette : 4 à 5 couleurs communes à TOUTE la vidéo, en anglais.",
    "Dans CHAQUE imagePrompt et videoPrompt, recopie mot pour mot la description du personnage. Jamais « the same man ».",
    "imagePrompt et videoPrompt en anglais, 1 à 3 éléments, silhouette claire, décor minimal, aucun texte dans l'image.",
    "CORRESPONDANCE TEXTE–IMAGE : l'image illustre LITTÉRALEMENT la narration de la scène.",
    "videoPrompt : action simple, caméra VERROUILLÉE (pas de zoom, pas de recadrage). Seuls les papiers bougent. 8 secondes max.",
    "N'utilise JAMAIS de noms protégés (films, marques, artistes) dans imagePrompt / videoPrompt : décris ce qu'on voit.",
    CTA_BRIEF,
    "Le champ cta = cette unique phrase, prête à être lue.",
    'Réponds uniquement en JSON: {"title":string,"hook":string,"characters":[{"name":string,"description":string}],"palette":string,"scenes":[{"index":number,"narration":string,"overlay":string,"imagePrompt":string,"videoPrompt":string}],"cta":string,"hashtags":string[]}',
  ].join("\n");
}

export function scriptUserPrompt(kind: PapierKind, topic: string): string {
  const base = topic.trim() || "un fait fascinant surprenant au choix";
  return kind === "pub"
    ? `Sujet : ${base}. Glisse une mention naturelle de l'application Sophia uniquement dans le CTA.`
    : `Sujet : ${base}. Le script doit d'abord poser un hook percutant, puis tout expliquer clairement, sans trou.`;
}

export function topicSystemPrompt(
  style: PapierNarrationStyle,
  recents: string[],
  seed: string,
  categorie: PapierCategorie = "aleatoire",
): string {
  const exclus = recents.filter(Boolean).slice(0, 12);
  return [
    "Tu proposes des sujets de vidéos courtes de culture générale.",
    "LANGUE DE SORTIE : français de France.",
    TOPIC_BRIEF[style] ?? TOPIC_BRIEF.revelation,
    `DOMAINE OBLIGATOIRE : ${CATEGORIE_BRIEF[categorie] ?? CATEGORIE_BRIEF.aleatoire}`,
    `Graine d'aléatoire (ne la mentionne jamais) : ${seed}. Ne propose pas l'exemple le plus évident du domaine.`,
    exclus.length
      ? `N'utilise PAS ces sujets déjà traités : ${exclus.join(" · ")}.`
      : "",
    "Vocabulaire simple, une seule idée, vérifiable, racontable en 60 secondes.",
    "Le sujet doit pouvoir porter un hook TikTok fort : assez concret pour intriguer en deux phrases.",
    'Réponds uniquement en JSON: {"topic": string}',
  ]
    .filter(Boolean)
    .join("\n");
}
