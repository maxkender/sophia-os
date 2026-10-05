/**
 * Mentions d'applis concurrentes dans le texte des slides.
 *
 * Les comptes source font souvent la promo d'une autre appli (« the vent now
 * app helped me… », « i use readup to block my apps »). Le placement Sophia
 * remplace UNE slide, mais le modèle ne choisissait pas toujours celle-là :
 * 58 passages weird_alpha sont partis avec « vent now » (octobre 2026).
 *
 * Deux garde-fous déterministes :
 *  - `positionConcurrent` : la slide qui cite un concurrent est la cible
 *    imposée du placement (elle porte déjà une recommandation d'appli) ;
 *  - `sansConcurrent` : toute mention qui reste est retirée phrase par phrase
 *    (et parenthèse par parenthèse) avant que le deck ne parte.
 */

/** Noms d'applis concurrentes. « readup » collé seulement : « read up » est de l'anglais courant. */
export const MOTIF_CONCURRENT = /\b(vent[\s-]?now|readup)\b/i;

/** Variante globale, pour compter ou remplacer. */
const MOTIF_GLOBAL = new RegExp(MOTIF_CONCURRENT.source, "gi");

export function citeConcurrent(texte: string | null | undefined): boolean {
  return MOTIF_CONCURRENT.test(texte ?? "");
}

/**
 * Retire d'un texte de slide toute parenthèse et toute phrase qui citent un
 * concurrent. Les paragraphes (titre, corps) gardent leurs retours à la ligne.
 * Un texte sans mention ressort à l'identique.
 */
export function retirerConcurrent(texte: string): string {
  if (!citeConcurrent(texte)) return texte;
  const paragraphes = texte.split("\n").map((p) => {
    if (!citeConcurrent(p)) return p;
    // 1. Parenthèses : « (sauf vent now lol) » disparaît, la phrase reste.
    let q = p.replace(/\s*\([^()]*\)/g, (m) => (citeConcurrent(m) ? "" : m));
    // 2. Phrases : on coupe après . ! ? … et on jette celles qui citent encore.
    const phrases = q.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [q];
    q = phrases.filter((ph) => !citeConcurrent(ph)).join("").trim();
    return q.replace(/\s{2,}/g, " ").replace(/^[,;:\s]+/, "");
  });
  // Paragraphes vidés : on ne laisse pas de lignes vides en cascade.
  return paragraphes
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(MOTIF_GLOBAL, "")
    .trim();
}

type SlideTexte = { position: number; texte_overlay?: string | null };

/**
 * Position de la slide à remplacer par l'appli : la première slide (hors
 * couverture) qui cite un concurrent, sinon `undefined`.
 */
export function positionConcurrent(slides: readonly SlideTexte[]): number | undefined {
  return slides
    .filter((s) => s.position >= 2 && citeConcurrent(s.texte_overlay))
    .map((s) => s.position)
    .sort((a, b) => a - b)[0];
}

/** Le deck sans aucune mention de concurrent, et s'il a changé. */
export function sansConcurrent<T extends SlideTexte>(slides: readonly T[]): { slides: T[]; modifie: boolean } {
  let modifie = false;
  const propres = slides.map((s) => {
    if (!citeConcurrent(s.texte_overlay)) return s;
    modifie = true;
    return { ...s, texte_overlay: retirerConcurrent(s.texte_overlay ?? "") };
  });
  return { slides: propres, modifie };
}
