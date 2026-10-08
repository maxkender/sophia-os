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
 *
 * Un motif PAR APPLICATION (`motifConcurrentApplication`) : les concurrents
 * d'Unswipe sont les applis de temps d'écran. Sans motif passé, toutes les
 * fonctions gardent celui de Sophia : les appels Sophia (import, composer) ne
 * changent pas.
 */

/** Noms d'applis concurrentes de Sophia. « readup » collé seulement : « read up » est de l'anglais courant. */
export const MOTIF_CONCURRENT = /\b(vent[\s-]?now|readup)\b/i;

/**
 * Concurrents d'Unswipe : ceux de Sophia + les applis de temps d'écran.
 * Plusieurs noms sont des mots courants, d'où les conditions (mesurées sur
 * les 77 212 slides du stock, octobre 2026) :
 *  - « unscroll » : bloque les applis et propose un article à lire (97 slides,
 *    82 contenus) — le concurrent le plus cité du stock ;
 *  - « opal » : sauf bijou / ongles / couleur (« opal ring », « opal nails ») ;
 *  - « one sec » suivi de « app » seulement (« hold eye contact one second ») ;
 *    « onesec », « appblock(er) », « clearspace » collés seulement (« a clear
 *    space helps you focus », « app blocker » générique) ;
 *  - « brick » : « the brick » (hors « the brick wall »…), « brick app »,
 *    « brick phone blocker » — jamais « brick by brick » ;
 *  - « freedom » : « freedom app », « Freedom blocks distracting websites… » ;
 *  - « forest » : « forest app », ou une ligne qui n'est QUE « forest »
 *    (titre d'un listicle : « 3. forest » puis « grow a virtual tree… ») —
 *    jamais « forest bathing », « hike in a forest » ;
 *  - « app / appli » + nom, la forme traduite (« l'app Forest »).
 * Pas « jomo » : c'est un concept, pas une appli.
 */
export const MOTIF_CONCURRENT_UNSWIPE = new RegExp(
  [
    MOTIF_CONCURRENT.source,
    String.raw`\bunscroll\b`,
    String.raw`(?<!\b(?:an|fire|black|white|pink|blue)\s)\bopal\b(?![\s-]*(?:rings?|stones?|necklaces?|earrings?|pendants?|nails?|manicure|polish|chrome|glaz\w*|jewel\w*|gem\w*|colou?r\w*)\b)`,
    String.raw`\bone[\s-]?sec[\s-]?app\b`,
    String.raw`\bonesec\b`,
    String.raw`\bscreen[\s-]?zen\b`,
    String.raw`\bappblock(?:er)?\b`,
    String.raw`\bclearspace\b`,
    String.raw`\bthe[\s-]+brick\b(?![\s-]*(?:walls?|houses?|buildings?|roads?|by)\b)`,
    String.raw`\bbrick[\s-]?(?:app|phone[\s-]?blocker)\b`,
    String.raw`\bfreedom[\s-]?app\b`,
    String.raw`\bfreedom\s+blocks\b`,
    String.raw`\bforest[\s-]?app\b`,
    String.raw`^[ \t]*(?:\d+[.)][ \t]*)?forest[ \t]*$`,
    String.raw`\bapp(?:li)?[\s-]+(?:forest|freedom|brick|one[\s-]?sec)\b`,
  ].join("|"),
  "im",
);

const MOTIFS_PAR_APPLICATION: Readonly<Record<string, RegExp>> = {
  unswipe: MOTIF_CONCURRENT_UNSWIPE,
};

/** Motif des concurrents d'une application ; celui de Sophia par défaut. */
export function motifConcurrentApplication(slug: string | null | undefined): RegExp {
  return MOTIFS_PAR_APPLICATION[(slug ?? "").trim().toLowerCase()] ?? MOTIF_CONCURRENT;
}

/** Variante globale d'un motif, pour remplacer toutes ses occurrences. */
const globalDe = (motif: RegExp) =>
  new RegExp(motif.source, motif.flags.includes("g") ? motif.flags : `${motif.flags}g`);

export function citeConcurrent(
  texte: string | null | undefined,
  motif: RegExp = MOTIF_CONCURRENT,
): boolean {
  // Un motif global garde sa position entre deux `test` : on la remet à zéro.
  motif.lastIndex = 0;
  return motif.test(texte ?? "");
}

/**
 * Retire d'un texte de slide toute parenthèse et toute phrase qui citent un
 * concurrent. Les paragraphes (titre, corps) gardent leurs retours à la ligne.
 * Un texte sans mention ressort à l'identique.
 */
export function retirerConcurrent(texte: string, motif: RegExp = MOTIF_CONCURRENT): string {
  const cite = (t: string) => citeConcurrent(t, motif);
  if (!cite(texte)) return texte;
  const paragraphes = texte.split("\n").map((p) => {
    if (!cite(p)) return p;
    // 1. Parenthèses : « (sauf vent now lol) » disparaît, la phrase reste.
    let q = p.replace(/\s*\([^()]*\)/g, (m) => (cite(m) ? "" : m));
    // 2. Phrases : on coupe après . ! ? … et on jette celles qui citent encore.
    const phrases = q.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [q];
    q = phrases.filter((ph) => !cite(ph)).join("").trim();
    return q.replace(/\s{2,}/g, " ").replace(/^[,;:\s]+/, "");
  });
  // Paragraphes vidés : on ne laisse pas de lignes vides en cascade.
  return paragraphes
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(globalDe(motif), "")
    .trim();
}

type SlideTexte = { position: number; texte_overlay?: string | null };

/**
 * Position de la slide à remplacer par l'appli : la première slide (hors
 * couverture) qui cite un concurrent, sinon `undefined`.
 */
export function positionConcurrent(
  slides: readonly SlideTexte[],
  motif: RegExp = MOTIF_CONCURRENT,
): number | undefined {
  return slides
    .filter((s) => s.position >= 2 && citeConcurrent(s.texte_overlay, motif))
    .map((s) => s.position)
    .sort((a, b) => a - b)[0];
}

/** Le deck sans aucune mention de concurrent, et s'il a changé. */
export function sansConcurrent<T extends SlideTexte>(
  slides: readonly T[],
  motif: RegExp = MOTIF_CONCURRENT,
): { slides: T[]; modifie: boolean } {
  let modifie = false;
  const propres = slides.map((s) => {
    if (!citeConcurrent(s.texte_overlay, motif)) return s;
    modifie = true;
    return { ...s, texte_overlay: retirerConcurrent(s.texte_overlay ?? "", motif) };
  });
  return { slides: propres, modifie };
}
