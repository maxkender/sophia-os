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

════════════════════════════════
ÉTAPE 1 — TROUVER LE SUJET
════════════════════════════════

Un bon sujet est TOUJOURS une collision entre :
  (A) un objet culturel reconnaissable en 2 secondes, sans explication
      → un mythe, un film, une légende, un personnage, un objet quotidien
  (B) une preuve matérielle réelle et vérifiable
      → un fossile, une fouille, un calcul, une mesure de labo, une archive

Le sujet est validé seulement si les 3 réponses sont OUI :
  1. Le spectateur reconnaît (A) instantanément, sans contexte ?
  2. Il existe pour (B) une date, un nom, un chiffre ou un lieu précis ?
  3. Le fait produit un « je ne savais pas » et non un « je savais déjà » ?

Deux angles, les deux fonctionnent :
  - DÉMONTE : la science défait la croyance (le Cyclope = un crâne d'éléphant nain)
  - CONFIRME : la science valide la légende (Troie existait, l'éclipse d'Ulysse est datable)

Application par catégorie — la preuve matérielle reste obligatoire :
  Big history question → un événement daté qui a basculé sur un détail concret
  True crime / odd news → une affaire résolue par un objet ou une analyse précise
  Myths & legends → l'origine physique et vérifiable du mythe
  Everyday science → un objet banal dont le fonctionnement réel surprend
  Space & universe → une mesure ou une observation datée, jamais de spéculation
  Animals & nature → une capacité mesurée en labo, avec les chiffres
  Geography → un lieu dont la forme s'explique par un événement identifié
  Films & pop culture → une scène connue confrontée au calcul ou au fait réel
  Origins of things → l'accident ou l'erreur à l'origine d'un objet courant
  Famous figures → un fait documenté qui contredit l'image du personnage
  Unsolved mysteries → ce que les preuves établissent VRAIMENT, et où ça s'arrête

À EXCLURE :
  - les sujets saturés (Titanic, pyramides, Mona Lisa, Bermudes, Nikola Tesla)
  - tout ce qui n'a pas de preuve matérielle nommable
  - les thèses complotistes ou contestées par le consensus scientifique
  - tout sujet demandant plus de 2 phrases de mise en contexte
  - les listes et les classements

════════════════════════════════
ÉTAPE 2 — STRUCTURE SELON NARRATION_STYLE
════════════════════════════════

Les temps ne sont JAMAIS annoncés dans le texte.

▸ NARRATION_STYLE = "Reveal — Clues, then a final twist"
  1. AFFIRMATION (1 phrase) : un constat au présent qui heurte une croyance.
     Jamais une question. Modèles : « X a vraiment existé. » /
     « X a une origine bien réelle. » / « X a pu être daté au jour près. »
  2. PREUVE IMMÉDIATE (1-2 phrases) : l'élément matériel tout de suite.
  3. DÉCOR CONCRET (2-4 phrases) : chiffres, lieux, comparaisons physiques.
  4. RETOURNEMENT (1-3 phrases) : ouvre par « Sauf que » ou « Mais ».
     Contient la donnée la plus précise du script.
  5. CHUTE (1-2 phrases) : un paradoxe qui recadre tout.

▸ NARRATION_STYLE = "Big question — But do you really know why…?"
  1. LE FAIT ÉVIDENT (1 phrase) : ce que tout le monde constate sans y penser.
  2. LA FAUSSE RÉPONSE (1-2 phrases) : l'explication que 90 % des gens donnent.
  3. LA VRAIE CAUSE (3-5 phrases) : le mécanisme réel, avec ses chiffres.
  4. LA CONSÉQUENCE INATTENDUE (1-2 phrases) : ce que cette cause explique d'autre.
  5. CHUTE (1-2 phrases).
  La question du titre reste implicite : ne l'écris jamais dans le script.

▸ NARRATION_STYLE = "Immersive story — the scene as it was lived"
  1. ANCRAGE (1 phrase) : lieu + date + un personnage nommé. Présent de narration.
  2. LA SCÈNE (4-6 phrases) : ce qui se passe, dans l'ordre, vu de l'intérieur.
     Détails sensoriels concrets, aucun ressenti prêté au personnage.
  3. LE BASCULEMENT (1-2 phrases) : l'instant précis où tout change.
  4. LA PORTÉE (1-2 phrases) : ce que cette scène a déclenché ensuite.
  5. CHUTE (1 phrase).

════════════════════════════════
ÉTAPE 3 — STYLE
════════════════════════════════

FAIRE :
  - présent de narration, phrases courtes, une idée par phrase
  - ton neutre et factuel : le fait est spectaculaire, pas la voix
  - comparer systématiquement à un objet familier : « haut comme un mouton »,
    « épais comme un crayon », « 2 fois plus gros qu'un crâne humain »
  - énumérations sèches pour accélérer : « des traces d'incendie partout,
    des pointes de flèches dans les murs, des corps jamais enterrés »
  - assumer l'incertitude là où elle existe (« peut-être », « on ne sait pas si »)
    → c'est ce qui rend le reste crédible
  - écrire les nombres en toutes lettres quand la voix de synthèse risque de
    mal les lire, sauf les dates`;

export const VOICE_DELIVERY_DEFAUT = `VOIX & DÉBIT — voix off TikTok, papercraft, culture générale.

vitesse: 0.92
stabilite: 0.58

DÉBIT : posé, un peu plus lent qu'une conversation. Environ 2,5 mots par seconde. Une micro-pause après chaque point. Jamais précipité, jamais théâtral.

TON : quelqu'un qui raconte un fait précis. Pas un présentateur, pas un youtubeur surexcité. Tutoiement. Calme, clair, crédible. Le fait porte l'effet, pas la voix.

RESPIRATION : courte entre les phrases. Pas de soupir. Pas d'emphase sur « Sauf que » ou « Mais ».

NOMBRES : lus naturellement. Les dates (1871, 1994) comme des années. Les petites quantités déjà écrites en toutes lettres dans le script.

INTERDIT : rire, chuchotement forcé, suspense dans la voix, « saviez-vous que » chanté.`;

export const CTA_SOPHIA_DEFAUT = `RÈGLE CTA : UNE SEULE phrase courte, 6 à 12 mots, qui nomme Sophia une seule fois et invite à ouvrir l'appli.

Pas de paragraphe, pas de cours, pas de bénéfice long. Une phrase, c'est tout.

RÈGLE ABSOLUE : le mot « Sophia » (jamais « Sofia », jamais « Sophie ») apparaît EXACTEMENT UNE FOIS dans tout le script, uniquement dans le CTA.

Exemples de forme (à ne pas recopier) : « Retrouve ça sur Sophia, c'est gratuit. » / « La suite est sur Sophia, télécharge l'appli. »

Le champ cta = cette unique phrase, prête à être lue. Aucune scène ne parle de l'appli.`;

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
