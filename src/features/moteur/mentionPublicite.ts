/**
 * Mention de publicité imposée par la loi locale, ajoutée à la légende.
 *
 * Logique pure, partagée avec l'Edge : `supabase/functions/_shared/
 * mention_publicite.ts` en est la copie Deno, à garder synchro. Les tests
 * vivent dans `mentionPublicite.test.ts`.
 *
 * Nos slideshows font la promotion d'une appli : dans plusieurs pays c'est de
 * la publicité au sens réglementaire, et la légende doit le dire. La mention
 * est donc posée à la source — à l'assignation, sur le créneau ET sur le post
 * pont — plutôt que laissée à la bonne volonté du poster.
 *
 * ⚠️ La réglementation turque (guide Reklam Kurulu sur le marketing
 * d'influence) demande une mention *bien visible* : lisible sans dérouler la
 * légende, et pas noyée au milieu des autres hashtags. Le placement retenu ici
 * est un choix produit assumé, pas une lecture du texte : il satisfait « le
 * hashtag est présent », pas « la mention saute aux yeux ».
 */

/** Hashtag de mention publicitaire, par langue de compte. */
export const MENTION_PUBLICITE: Record<string, string> = {
  // Turquie — « Tanıtım » (promotion), la formule attendue par le régulateur.
  tr: "#Tanıtım",
};

/**
 * Clé de comparaison d'un hashtag : casse, dièse et i sans point mis de côté.
 *
 * Le turc distingue `ı` et `i`, et la traduction comme le poster écrivent
 * indifféremment « #Tanıtım », « #tanitim » ou « #TANITIM ». Les trois doivent
 * compter pour la même mention, sinon on la pose une seconde fois.
 */
function cleTag(tag: string): string {
  return tag
    .replace(/^#+/, "")
    .toLocaleLowerCase("tr")
    .replace(/[ıİI]/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Position d'insertion : jamais en tête, jamais en queue.
 *
 * Sur les 3 hashtags habituels ça donne `#a #b #Tanıtım #c` — la mention est
 * encadrée des deux côtés. En dessous de 3 hashtags l'encadrement est
 * impossible, on la place alors au plus loin du début.
 */
function positionInsertion(nbTags: number): number {
  return Math.max(1, Math.ceil(nbTags / 2));
}

/**
 * Ajoute la mention publicitaire de `langue` à une légende, si elle en a une.
 *
 * Idempotent : une légende qui porte déjà la mention (quelle qu'en soit
 * l'orthographe) ressort inchangée. Une langue sans mention ressort inchangée
 * elle aussi — la fonction est sûre à appeler sur tous les créneaux.
 */
export function avecMentionPublicite(hashtags: string, langue: string | null | undefined): string {
  const mention = MENTION_PUBLICITE[String(langue ?? "").trim().toLowerCase()];
  if (!mention) return hashtags;

  const tags = String(hashtags ?? "").split(/\s+/).filter(Boolean);
  const cible = cleTag(mention);
  if (tags.some((t) => cleTag(t) === cible)) return hashtags;

  tags.splice(positionInsertion(tags.length), 0, mention);
  return tags.join(" ");
}
