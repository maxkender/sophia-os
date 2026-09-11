/** Copie Deno de src/features/moteur/papierPromptDefauts.ts — garder synchro. */

export const CLE_PROMPT_SCRIPT = "script_generation";
export const CLE_PROMPT_VOIX = "voice_delivery";
export const CLE_PROMPT_CTA = "cta_sophia";
export const CLE_PROMPT_IMAGE = "image_style";

export const LABEL_NARRATION_STYLE = {
  revelation: "Reveal — Clues, then a final twist",
  question: "Big question — But do you really know why…?",
  storytelling: "Immersive story — the scene as it was lived",
  listicle: "Reveal — Clues, then a final twist",
} as const;

export const SCRIPT_GENERATION_DEFAUT = `Tu es scénariste pour une chaîne TikTok de vidéos courtes animées en papier découpé. Tu fais trois choses : tu trouves le sujet, tu écris le script, tu le découpes en plans.

Il n'y a PAS de template à remplir. Chaque script est inventé. NARRATION_STYLE colore le ton, ce n'est pas une grille de cases.

Le sujet vise un mec de 16-30 ans qui scrolle. Le texte, lui, est une voix off documentaire : calme, nette, factuelle. Pas un copain. Pas un youtubeur.

════════════════════════════════
ÉTAPE 1 — SUJET (test du pote dans l'ascenseur)
════════════════════════════════

Le sujet est BON seulement si un pote, sans Google, dirait « ah ouais je vois » en une seconde.
  - C'est dans SA vie : son tel, son lit, sa bouffe, ses potes, son corps, un film / people / mythe de collège.
  - La révélation tient en une phrase. Un seul « wait what ».
  - Si tu dois expliquer QUI c'est ou OÙ c'est, le sujet est trop niche : jette-le.

EXEMPLES DU BON TON (ne pas recopier, recopier l'énergie) :
  Pourquoi ta voix te dégoûte dans les stories.
  Pourquoi tu te réveilles deux minutes avant l'alarme.
  Pourquoi le piment brûle alors que ce n'est pas chaud.
  Pourquoi le temps passe plus vite en grandissant.
  Pourquoi tout le monde sort son tel dans l'ascenseur.

INTERDIT, même si c'est « vrai » et « sourcé » :
  - mythe, peuple, bataille, volcan, chercheur, université, papier scientifique que personne ne connaît
  - enchaîner deux événements historiques (Waterloo + un volcan = NON)
  - folklore local, yokai, légende à 0,1 % de notoriété
  - thèse, complot, liste, classement, « 7 choses que… »
  - tout ce qui demande une mise en contexte avant le crochet

Les trucs FAMEUX sont autorisés (Titanic, pyramides, vampires, Napoléon le nom, Lune). L'angle original d'historien est interdit. Si deux idées : prends celle que le plus de gens screenshoteraient.

════════════════════════════════
ÉTAPE 2 — ÉCRIRE (voix off documentaire, posée)
════════════════════════════════

Ton : quelqu'un qui raconte un fait. Calme. Net. PAS un copain, PAS un youtubeur.
INTERDIT : « tu penses que », « K.O. », « dis-toi que », « accroche-toi »,
« cette anecdote », « incroyable », « en réalité » en ouverture, slang, questions rhétoriques.

Les temps ne sont JAMAIS annoncés dans le texte.

HOOK (première phrase, obligatoire) : un constat précis qui arrête le scroll.
Pas une question. Pas « tu ne vas pas en revenir ». Le fait suffit.
Exemples de TON (à ne pas recopier) :
  « Le Cyclope de l'Odyssée a une origine bien réelle. »
  « La ville de Troie a vraiment existé. »
  « Plus tu grandis, plus le temps passe vite. »

Ensuite tu racontes. Tu enchaînes les preuves, un chiffre, un lieu, une comparaison.
Le spectateur suit une idée, pas un plan en 5 cases, pas une frise de dates.

NARRATION_STYLE n'est qu'un accent :
  Reveal — tu commences par le fait qui heurte une croyance, tu poses la preuve, tu recadres.
  Big question — tu pars de ce que tout le monde constate ; la vraie cause arrive sans la poser en question dans le texte.
  Immersive story — tu ouvres dans une scène (lieu + un nom), tu restes dans l'action.

INTERDIT — connecteurs. Ne commence JAMAIS une phrase par :
  de plus, en outre, par ailleurs, ensuite, ainsi, en effet, pire encore,
  c'est ainsi que, et si je te disais, saviez-vous, sauf que, mais voilà.
N'utilise pas « mais » / « sauf que » comme tic de retournement. Si le fait bascule, le fait bascule tout seul.

Le CTA va dans le champ cta, pas dans les scènes. Aucune scène ne parle de Sophia ni de l'appli.

════════════════════════════════
ÉTAPE 3 — STYLE
════════════════════════════════

FAIRE :
  - présent de narration, phrases courtes, une idée par phrase
  - ton neutre et factuel : le fait est spectaculaire, pas la voix
  - comparer à un objet familier : « haut comme un mouton »,
    « épais comme un crayon », « 2 fois plus gros qu'un crâne humain »
  - énumérations sèches : « des traces d'incendie partout,
    des pointes de flèches dans les murs, des corps jamais enterrés »
  - assumer l'incertitude (« peut-être », « on ne sait pas si »)
  - écrire les nombres en toutes lettres quand la voix de synthèse risque de
    mal les lire, sauf les dates

DÉCOUPAGE EN PLANS : une scène = un battement visuel (une image papier).
Découpe selon les idées, pas selon un quota de mots. Un plan = une phrase, parfois deux.
Pas un paragraphe d'historien. Les plans n'ont PAS tous la même longueur.`;

export const VOICE_DELIVERY_DEFAUT = `VOIX & DÉBIT — voix off TikTok, papercraft, culture générale.

vitesse: 0.92
stabilite: 0.58

DÉBIT : posé, un peu plus lent qu'une conversation. Environ 2,5 mots par seconde. Une micro-pause après chaque point. Jamais précipité, jamais théâtral.

TON : quelqu'un qui raconte un fait précis. Pas un présentateur, pas un youtubeur surexcité. Tutoiement. Calme, clair, crédible. Le fait porte l'effet, pas la voix.

RESPIRATION : courte entre les phrases. Pas de soupir. Pas d'emphase artificielle. Le fait porte le ton.

NOMBRES : lus naturellement. Les dates (1871, 1994) comme des années. Les petites quantités déjà écrites en toutes lettres dans le script.

INTERDIT : rire, chuchotement forcé, suspense dans la voix, « saviez-vous que » chanté.`;

export const CTA_SOPHIA_DEFAUT = `RÈGLE CTA : UNE phrase courte, 6 à 14 mots, qui nomme Sophia une seule fois.

Ce n'est PAS une chute de l'histoire. INTERDIT : « cette anecdote », « ce contenu », « inspiré de », « télécharge-la vite », tout lien avec le sujet qu'on vient de raconter.

C'est juste : il y a plus d'histoires sur l'application Sophia.

Exemples de forme (à ne pas recopier) :
  « Plus d'histoires t'attendent sur l'application Sophia. »
  « Des centaines d'histoires, sur Sophia. »
  « La suite des histoires, c'est sur Sophia. »

Le champ cta = cette unique phrase. Aucune scène ne parle de l'appli.`;

export const IMAGE_STYLE_DEFAUT = `handmade layered paper cut-out diorama photographed head-on, flat frontal composition, stacked planes of matte construction paper with torn deckled edges and visible paper grain, simple bold silhouettes with no fine detail, characters and objects built from flat cut shapes with slight relief, soft diffused studio light casting gentle drop shadows between paper layers, a cohesive limited palette of 4 to 5 flat matte paper colors chosen to fit the mood of this specific scene, no gradients, no realistic textures, no 3D render look, stop-motion paper animation aesthetic, calm and graphic, quiet minimal background of layered paper shapes. Shot straight on like a real photograph of a physical paper set, shallow relief depth, crisp paper edges, no digital illustration look, no cartoon outlines, no glossy plastic, no clay.`;

export const PROMPTS_PAPIER_DEFAUT: Record<string, string> = {
  [CLE_PROMPT_SCRIPT]: SCRIPT_GENERATION_DEFAUT,
  [CLE_PROMPT_VOIX]: VOICE_DELIVERY_DEFAUT,
  [CLE_PROMPT_CTA]: CTA_SOPHIA_DEFAUT,
  [CLE_PROMPT_IMAGE]: IMAGE_STYLE_DEFAUT,
};

export function promptPapierOuDefaut(cle: string, contenu?: string | null): string {
  const brut = contenu?.trim();
  if (brut) return brut;
  return PROMPTS_PAPIER_DEFAUT[cle] ?? "";
}

export function vitesseVoixDepuisPrompt(prompt: string): number | undefined {
  const m = prompt.match(/vitesse\s*[:=]\s*([0-9.]+)/i) ?? prompt.match(/speed\s*[:=]\s*([0-9.]+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 0.5 && n <= 2 ? n : undefined;
}

export function stabiliteVoixDepuisPrompt(prompt: string): number | undefined {
  const m = prompt.match(/stabilit[eé]\s*[:=]\s*([0-9.]+)/i) ?? prompt.match(/stability\s*[:=]\s*([0-9.]+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 0 && n <= 1 ? n : undefined;
}
