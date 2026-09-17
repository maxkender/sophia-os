/**
 * Décisions pures du cycle de vie d'un deck langue.
 *
 * Extrait d'`assurerDeckPourLangue` (Edge) pour être testable : c'est là que
 * vivaient trois bugs coûteux, tous silencieux.
 *
 * Source de vérité : ce fichier. `supabase/functions/_shared/deck_langue.ts` en
 * est la copie Deno, à garder synchro — `deckLangue.test.ts` compare les deux.
 */

export interface SlideDeck {
  position: number;
  /** `null` toléré : c'est ce que rend la base quand une slide n'a pas de texte. */
  texte_overlay: string | null;
  position_sophia: boolean;
}

export interface LigneLangueBase {
  slides?: SlideDeck[] | null;
  slides_base?: SlideDeck[] | null;
}

/** Un deck est « cuit » : il a du texte ET son placement publicitaire. */
export function estDeckPret(slides: SlideDeck[] | null | undefined): boolean {
  const deck = slides ?? [];
  return (
    deck.length > 0 &&
    deck.some((s) => s.texte_overlay) &&
    deck.some((s) => s.position_sophia)
  );
}

/**
 * Base de traduction d'un contenu : la version BRUTE de la ligne source si on
 * l'a mise à l'abri, sinon la ligne source telle quelle.
 *
 * `slides_base` existe parce qu'un compte publiant dans la langue source posait
 * sa slide Sophia DANS la ligne qui sert de base à toutes les traductions.
 */
export function baseDeTraduction(ligne: LigneLangueBase | null | undefined): SlideDeck[] {
  const base = ligne?.slides_base ?? [];
  if (base.length > 0) return [...base];
  return [...(ligne?.slides ?? [])];
}

/**
 * Peut-on encore sauvegarder la base brute de cette ligne source ?
 *
 * Non si elle est déjà sauvegardée, non si elle est vide, et non si elle porte
 * déjà un placement : dans ce dernier cas le texte d'origine de la slide
 * remplacée est perdu, et figer la pub comme « base » serait pire que rien.
 */
export function peutSauverBase<T extends LigneLangueBase>(
  ligne: T | null | undefined,
): ligne is T {
  if (!ligne) return false;
  if ((ligne.slides_base ?? []).length > 0) return false;
  const slides = ligne.slides ?? [];
  if (slides.length === 0) return false;
  return !slides.some((s) => s.position_sophia);
}

/**
 * Assemble le deck traduit à partir de la base et des traductions reçues.
 *
 * Trois garde-fous, tous nés d'un dégât constaté en production :
 *  1. `traduits` compte les positions réellement traduites. Zéro = traduction
 *     ratée : l'appelant DOIT jeter plutôt que persister. Un deck vide persisté
 *     est définitif (il passe « prêt » grâce à la seule slide pub), et 15 posts
 *     sont partis avec la pub pour unique texte.
 *  2. Une position sautée par le modèle garde le texte source au lieu de
 *     devenir muette.
 *  3. `position_sophia` de la base est REPORTÉ : une base déjà polluée porte sa
 *     pub, on ne doit pas en placer une seconde (23 carrousels en avaient deux).
 */
export function fusionnerDeckTraduit(
  deckSource: SlideDeck[],
  traductions: Array<{ position: number; translated: string }>,
): { slides: SlideDeck[]; traduits: number } {
  const parPosition = new Map(
    traductions.map((t) => [Number(t.position), String(t.translated ?? "").trim()]),
  );
  let traduits = 0;
  const slides = deckSource.map((s) => {
    const traduit = parPosition.get(s.position) ?? "";
    if (traduit) traduits += 1;
    return {
      position: s.position,
      texte_overlay: traduit || (s.texte_overlay ?? ""),
      position_sophia: Boolean(s.position_sophia),
    };
  });
  return { slides, traduits };
}

/**
 * Formes FRANÇAISES de « l'appli » — le calque qui s'est glissé dans 212 slides
 * publicitaires et 190 TikToks publiés, sur treize langues.
 *
 * Le prompt maître les bannit désormais explicitement, mais un prompt n'est
 * qu'une consigne : ce filtre, lui, est déterministe.
 */
const FRANCAIS_RESIDUEL = /\bl\s*['’]\s*appli(cation)?s?\b/i;

export function contientFrancaisResiduel(texte: string | null | undefined): boolean {
  return FRANCAIS_RESIDUEL.test(texte ?? "");
}

/**
 * Écarte les variantes de placement qui contiennent encore du français alors
 * que la langue de sortie n'est pas le français.
 *
 * Rendre une liste VIDE est un signal volontaire : l'appelant doit relancer le
 * modèle plutôt que publier une pub moitié française. Le français, lui, passe
 * tel quel — « l'appli Sophia » y est la formule attendue.
 */
export function variantesSansFrancaisResiduel(
  variantes: string[],
  langue: string | null | undefined,
): string[] {
  if ((langue ?? "fr") === "fr") return [...variantes];
  return variantes.filter((v) => !contientFrancaisResiduel(v));
}
