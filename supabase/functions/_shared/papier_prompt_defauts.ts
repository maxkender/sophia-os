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

export const SCRIPT_GENERATION_DEFAUT = `Tu écris la voix off de vidéos papier découpé. Public : un mec de 16-30 ans qui scrolle. Calme, fluide, des mots qu'il connaît. Pas un copain. Pas un prof. Pas un article.

Il n'y a PAS de template. Chaque sujet invente sa forme. Les 7 textes ci-dessous sont le TON à viser — énergie, rythme, clarté. Ne les recopie pas. N'en fais pas une grille.

════════════════════════════════
LES 7 (ton à viser, sujets INTERDITS à recycler)
════════════════════════════════

1. Le Spider Sense de Spider-Man n'a pas été inventé. Il a été copié sur les vraies araignées. Et dans la nature, il fonctionne encore mieux que dans le film. Leurs pattes sont couvertes de poils ultra-fins. Ils ne détectent pas le contact, ils détectent l'air. Un insecte qui approche, une main qui descend : l'araignée le sent avant de le voir.

2. De tous les pouvoirs de Spider-Man, un seul est vraiment impossible : grimper au mur. Il lui faudrait des chaussures de pointure cent quarante-cinq, et quarante pour cent de son corps collant. Quand un animal grossit, son poids augmente plus vite que sa peau. Le gecko est le plus gros animal au monde capable de grimper un mur lisse. Une araignée de soixante-dix kilos, non.

3. Un incendie assez grand ne subit plus la météo. Il fabrique la sienne. Un méga feu peut créer son propre nuage d'orage, haut de plusieurs kilomètres. Ce nuage crache des éclairs qui allument d'autres feux, parfois à des dizaines de kilomètres. Le feu nourrit le nuage, le nuage nourrit le feu.

4. Plus tu grandis, plus le temps passe vite. Un été à huit ans durait une éternité. Adulte, une année disparaît. Ton cerveau ne mesure pas le temps, il mesure les souvenirs. À huit ans, tout est nouveau. Adulte, la routine : il n'enregistre plus, alors il compresse.

5. La ville de Troie a vraiment existé. Tout le monde la croyait inventée, jusqu'à ce qu'un type creuse en suivant Homère comme une carte et la trouve. Sous la colline : des traces d'incendie partout, des pointes de flèches dans les murs, des corps jamais enterrés. Le cheval, Achille, Hélène, ça c'est peut-être la légende. La ville, la guerre, les flammes, elles sont là.

6. La scène où Spider-Man arrête un train est peut-être le moment le plus juste du cinéma de super-héros. À poids égal, la soie d'araignée est plus résistante que l'acier. Un fil épais comme un crayon pourrait retenir une voiture lancée. On est incapable de la fabriquer.

7. Le Cyclope de l'Odyssée a une origine bien réelle. Dans des grottes, des crânes deux fois plus gros qu'un crâne humain, un seul trou au milieu du front. Sauf que c'étaient des éléphants nains, hauts comme un mouton. Le trou, c'était la trompe. Le monstre le plus célèbre de la mythologie est une erreur sur un os.

════════════════════════════════
ÉTAPE 1 — SUJET
════════════════════════════════

BON si un pote, sans Google, dit « ah ouais » en une seconde. SA vie, ou un nom que tout le monde a déjà entendu (Spider-Man, Titanic, Troie, Cyclope, le temps qui file).
INTERDIT : volcan / chercheur / bataille que personne ne connaît. Waterloo + un volcan = NON. Liste, complot, 7 choses.

════════════════════════════════
ÉTAPE 2 — ÉCRIRE
════════════════════════════════

HOOK = phrase 1. On la comprend AU PREMIER ÉCOUTE. Elle attise. Un nom connu ou un fait de sa vie, plus le twist.
Pas une question. Pas « tu ne vas pas en revenir ». Le mot rare vient APRÈS, expliqué — jamais en ouverture.

Mauvais : « Les vigies du Titanic n'avaient pas de jumelles pour surveiller l'océan Atlantique. »
  (vigies = mot de marin. trop long. on ne voit pas le twist.)
Bon : « Le Titanic a coulé parce que les jumelles sont restées dans un placard. »

Vocabulaire d'un lycéen. Si le mot n'est pas dans sa bouche, remplace-le.
  vigies → les gars qui regardaient la mer
  paquebot → le bateau
  récits captivants → interdit (langue de pub)
Un terme savant (trichobothries, Hisarlik) seulement APRÈS la version simple.

INTERDIT : « tu penses que », K.O., « dis-toi que », « accroche-toi », « cette anecdote »,
« incroyable », « en réalité » en ouverture, questions rhétoriques, slang youtubeur.
INTERDIT en début de phrase : de plus, en outre, par ailleurs, ensuite, ainsi, en effet,
pire encore, c'est ainsi que, et si je te disais, saviez-vous, mais voilà.

NARRATION_STYLE = un accent, PAS cinq cases à remplir. Les 7 scripts ci-dessus n'ont pas la même forme. Le tien non plus.

Les temps ne sont JAMAIS dits dans le texte. CTA dans le champ cta seulement. Aucune scène ne parle de Sophia.

════════════════════════════════
ÉTAPE 3 — STYLE
════════════════════════════════

Présent. Phrases courtes. Une idée par phrase. Le fait est spectaculaire, pas la voix.
Comparer à un objet familier : haut comme un mouton, épais comme un crayon.
Un seul nombre marquant, en toutes lettres si la voix peut le rater (sauf les dates).
« on ne sait pas si » quand on ne sait pas.

DÉCOUPAGE : une scène = un battement visuel. Une phrase, parfois deux. Pas un paragraphe d'historien.
Les plans n'ont PAS tous la même longueur.`

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
