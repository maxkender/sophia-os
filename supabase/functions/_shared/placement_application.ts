/**
 * Placement d'une application AUTRE que Sophia dans un slideshow.
 *
 * Jumeau de `integrateSophia` (gemini.ts) : même structure de prompt (langue
 * de sortie en tête, prompt maître de l'admin, données du deck, consignes de
 * sortie), mêmes bornes de position, même JSON, mêmes reprises. Ce qui change :
 *
 *  - les règles de marque sont GÉNÉRIQUES, écrites avec `application.nom` : le
 *    texte Sophia (« une appli de micro-apprentissage comme Sophia », exemples
 *    « die Sophia-App »…) ne doit jamais fuiter dans une pub Unswipe ;
 *  - pas de bloc « corrections » : ce sont des retours de l'admin sur la slide
 *    SOPHIA, ils apprendraient au modèle à citer Sophia ;
 *  - le bloc d'angles des labels (`blocAngles`) est injecté dans les données
 *    quand il n'est pas vide ;
 *  - les variantes sont filtrées de façon déterministe : nom de l'application
 *    présent, « Sophia » absent, pas de « l'appli » française hors français.
 *    Aucune variante valable → on relance ; après 4 essais → `null`, et
 *    l'appelant échoue franchement (jamais de texte de repli : celui de
 *    `placementParDefaut` est une pub Sophia).
 */
import { variantesSansFrancaisResiduel } from "./deck_langue.ts";
import {
  callWithFallback,
  LANGUES,
  type SophiaPlacement,
  TEXT_MODELS,
  textOf,
} from "./gemini.ts";

export interface PlacementApplicationEntree {
  /** Prompt maître `placement_<slug>` de l'admin (jamais le texte Sophia). */
  masterPrompt: string;
  slides: Array<{ position: number; text: string }>;
  caption: string;
  /** Langue du compte : la slide de placement doit parler comme ses voisines. */
  langue: string;
  application: { slug: string; nom: string };
  /** Bloc déjà construit par `blocAngles` ; "" quand aucun angle n'est saisi. */
  angles: string;
}

export interface OptionsPlacementApplication {
  /** Attente entre deux essais (injectée par les tests pour ne pas dormir). */
  attendre?: (ms: number) => Promise<void>;
}

const NB_ESSAIS = 4;

/** « Sophia » en mot entier, toutes casses : la marque qu'on ne doit jamais citer ici. */
export const MOT_SOPHIA = /\bsophia\b/i;

const attendreParDefaut = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Positions où la pub peut tomber : les 3 dernières, jamais la couverture
 * (slide 1). Même borne que Sophia.
 */
export function positionsAutorisees(slides: Array<{ position: number }>): number[] {
  const positions = slides.map((s) => s.position).sort((a, b) => a - b);
  return positions.filter((p) => p >= 2).slice(-3);
}

/** Le prompt envoyé au modèle. Pur : testé sans réseau. */
export function construirePromptPlacementApplication(input: PlacementApplicationEntree): string {
  const autoriseesTxt = positionsAutorisees(input.slides).join(", ");
  const slideList = input.slides
    .map((s) => `Slide ${s.position} : "${s.text || "(vide)"}"`)
    .join("\n");

  const code = input.langue || "fr";
  const langue = LANGUES[code] ?? code;
  const nom = input.application.nom;

  // Les exemples du mot « appli » sont ceux du prompt Sophia, réécrits avec le
  // nom de l'application : c'est eux qui ont fait disparaître le calque
  // français « l'appli » des slides étrangères (212 slides, 13 langues).
  return `LANGUE DE SORTIE : ${langue.toUpperCase()}.
Les variantes que tu écris doivent être en ${langue}, quelle que soit la langue
des consignes ci-dessous.

${input.masterPrompt}

--- DONNÉES ---
Application à placer : ${nom}
Légende de la vidéo : ${input.caption || "(aucune)"}
Slides du slideshow (slide 1 = couverture) :
${slideList}${input.angles}

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de ${nom} doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : ${autoriseesTxt}. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTIONNER ${nom} selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge ${nom} », mais une formule du type
  « une appli comme ${nom} », rendue en ${langue}. Si les slides sont à la
  1re personne, une mention directe de ${nom} est parfaitement acceptable
  (« j'utilise l'appli ${nom}… », rendue en ${langue}).
- Le nom « ${nom} » ne se traduit jamais et ne se déforme pas (seule sa casse
  peut suivre celle des slides), mais TOUT ce qui l'entoure, si : le mot pour
  « appli » doit être celui de la langue de sortie (anglais « the ${nom} app »,
  allemand « die ${nom}-App », italien « l'app ${nom} », turc « ${nom}
  uygulaması », espagnol « la app ${nom} »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- ne citer AUCUNE autre application ni marque que ${nom} : jamais Sophia, jamais
  un concurrent.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide ${nom} doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en ${langue} et citent ${nom}.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`;
}

/**
 * Garde-fous déterministes sur les variantes : un prompt n'est qu'une
 * consigne. Une pub qui ne nomme pas l'application ne sert à rien ; une pub
 * qui nomme Sophia sur un créneau Unswipe fausse les stats des deux et brouille
 * le compte. Liste vide = l'appelant relance le modèle.
 */
export function variantesValidesApplication(
  variantes: string[],
  langue: string,
  nom: string,
): string[] {
  const nomMinuscule = nom.trim().toLowerCase();
  return variantesSansFrancaisResiduel(variantes, langue).filter(
    (v) => !!nomMinuscule && v.toLowerCase().includes(nomMinuscule) && !MOT_SOPHIA.test(v),
  );
}

/**
 * Place `application` dans le deck selon son prompt maître. Même forme de
 * résultat que `integrateSophia` ; `null` quand le modèle n'a rien rendu
 * d'utilisable après 4 essais.
 */
export async function integrerApplication(
  input: PlacementApplicationEntree,
  options: OptionsPlacementApplication = {},
): Promise<SophiaPlacement | null> {
  const attendre = options.attendre ?? attendreParDefaut;
  const autorisees = positionsAutorisees(input.slides);
  if (autorisees.length === 0) return null;
  const prompt = construirePromptPlacementApplication(input);

  // Quatre essais espacés, comme Sophia : une réponse mal formée, des
  // variantes toutes rejetées ou une surcharge passagère ne doivent pas faire
  // perdre le deck du premier coup.
  for (let essai = 0; essai < NB_ESSAIS; essai += 1) {
    if (essai > 0) await attendre(1500 * essai + Math.random() * 1000);

    try {
      const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
      const raw = textOf(parts).replace(/^```(?:json)?|```$/g, "").trim();

      const parsed = JSON.parse(raw);
      const chosenPosition = Number(parsed.chosen_position);
      const brutes: string[] = (Array.isArray(parsed.variants) ? parsed.variants : [])
        .map((v: unknown) => String(v ?? "").trim())
        .filter(Boolean);

      // `best` désigne une variante BRUTE : on le suit à travers le filtre
      // pour ne pas retenir la mauvaise quand une variante est écartée.
      const best = Number(parsed.best);
      const preferee = Number.isInteger(best) && best >= 0 && best < brutes.length
        ? brutes[best]
        : null;
      const variants = variantesValidesApplication(brutes, input.langue, input.application.nom);

      // Position hors zone : ramenée sur la dernière autorisée (comme Sophia).
      const positionFinale = autorisees.includes(chosenPosition)
        ? chosenPosition
        : autorisees[autorisees.length - 1];
      if (!positionFinale || variants.length === 0) continue;

      const indexPreferee = preferee === null ? -1 : variants.indexOf(preferee);
      const bestIndex = indexPreferee >= 0 ? indexPreferee : 0;

      return { chosenPosition: positionFinale, mode: String(parsed.mode ?? ""), variants, bestIndex };
    } catch {
      // appel en échec ou réponse illisible : on retente après l'attente
    }
  }

  return null;
}
