/** Défauts des 4 prompts Papier éditables sur /admin/prompts. */

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

export const SCRIPT_GENERATION_DEFAUT = `Tu écris des voice-over TikTok pour des vidéos papier découpé. Public : un mec lambda de 16-30 ans qui scrolle. Pas un documentaire. Pas un cours d'histoire. Un script qu'on DIRIAIT collé sous une vidéo virale.

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
ÉTAPE 2 — SCRIPT VOIX-OFF (c'est un SCRIPT, pas un exposé)
════════════════════════════════

Tu écris comme on PARLE dans une vidéo TikTok. Tutoiement. Phrases courtes. Une idée = un plan = un cut.

Structure (ordre, pas une grille à remplir mot pour mot) :
  1. HOOK — 1 phrase « tu ». Le viewer se reconnaît ou stoppe. Pas une date. Pas un nom de chercheur.
  2. LE TRUC — 1-2 plans : ce que tout le monde croit / fait.
  3. LA CAUSE — 2-4 plans : le mécanisme, simple, un chiffre max. Pas une frise.
  4. RETOUR À SA VIE — 1 plan : du coup, maintenant, tu comprends pourquoi tu vis ça.
  Le CTA va dans le champ cta, pas dans les scènes.

Les temps ne sont JAMAIS dits à l'écran (« scène 2 », « 8 secondes »).

HOOK — exemples de TON (ne pas recopier) :
  « Ta voix dans les stories, c'est pas ta vraie voix. »
  « Tu te réveilles deux minutes avant l'alarme, presque à chaque fois. »
  « Plus tu grandis, plus les années passent vite. »

INTERDIT dans le texte :
  - ton Wikipédia : « En 2018, des chercheurs de… », « or, », « ainsi », « en effet »
  - connecteurs de copie : de plus, en outre, par ailleurs, ensuite, pire encore, c'est ainsi que, et si je te disais, accroche-toi, saviez-vous, sauf que, mais voilà
  - « mais » / « sauf que » en tic de retournement
  - énumérer 6 dates. Un chiffre mémorable, c'est assez

NARRATION_STYLE = juste l'accent :
  Reveal — tu poses le truc bizarre, tu donnes la cause, tu recadres sa vie.
  Big question — tu pars de ce qu'il vit tous les jours ; la cause arrive sans « savais-tu que ».
  Immersive story — tu ouvres DANS sa scène (le tel, le lit, la cuisine), tu restes dans l'action.

════════════════════════════════
ÉTAPE 3 — STYLE
════════════════════════════════

FAIRE :
  - présent, phrases de 5 à 14 mots, une idée par phrase
  - ça doit sonner LU À VOIX HAUTE, pas écrit pour un article
  - comparer à un truc de sa vie : « comme quand tu… », « la taille d'un… »
  - un seul nombre marquant, écrit en toutes lettres si la voix peut le rater (sauf les années)
  - « on ne sait pas » si on ne sait pas. Pas de bullshit

DÉCOUPAGE : une scène = un cut visuel. 1 phrase, parfois 2. Les plans n'ont PAS tous la même longueur. Pas un paragraphe d'historien par plan.`;

export const VOICE_DELIVERY_DEFAUT = `VOIX & DÉBIT — voix off TikTok, papercraft, culture générale.

vitesse: 0.92
stabilite: 0.58

DÉBIT : posé, un peu plus lent qu'une conversation. Environ 2,5 mots par seconde. Une micro-pause après chaque point. Jamais précipité, jamais théâtral.

TON : quelqu'un qui raconte un fait précis. Pas un présentateur, pas un youtubeur surexcité. Tutoiement. Calme, clair, crédible. Le fait porte l'effet, pas la voix.

RESPIRATION : courte entre les phrases. Pas de soupir. Pas d'emphase artificielle. Le fait porte le ton.

NOMBRES : lus naturellement. Les dates (1871, 1994) comme des années. Les petites quantités déjà écrites en toutes lettres dans le script.

INTERDIT : rire, chuchotement forcé, suspense dans la voix, « saviez-vous que » chanté.`;

export const CTA_SOPHIA_DEFAUT = `RÈGLE CTA : 1 ou 2 phrases courtes, lues à voix haute. Le mot « Sophia » (jamais « Sofia », jamais « Sophie ») apparaît EXACTEMENT UNE FOIS dans tout le script, uniquement ici.

Le CTA dit clairement que ce contenu vient de l'application Sophia, et d'aller la télécharger pour en apprendre plus. C'est une invitation, pas une blague, pas une chute poétique.

Varie la formulation, garde l'idée. Exemples de forme (à ne pas recopier) :
  « Ce contenu est inspiré de l'application Sophia. Télécharge-la pour en apprendre plus. »
  « Inspiré de l'appli Sophia — télécharge-la si tu veux la suite. »
  « Ça vient de l'application Sophia. Télécharge-la pour en apprendre plus. »

Pas de paragraphe. Aucune scène hors CTA ne parle de l'appli. Le champ cta = le texte prêt à être lu.`;

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
