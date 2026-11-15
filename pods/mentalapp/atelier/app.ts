// L'élément Sophia qui remplace LEUR appli (« seeing progress (check bio) »
// avec l'icône de Journey) : l'icône Sophia et sa légende, par langue.
// Relance du label pour Sophia (15/11) : jusqu'au 4/11, c'était l'élément
// UnSwipe, « delete short-videos (UnSwipe app) ».
//
// La légende dit ce que fait Sophia sur ces sujets (son bloqueur : TikTok et
// Instagram fermés tant qu'on n'a pas lu un cours) et nomme Sophia comme le
// veut le prompt `placement_sophia` : toujours avec « comme » (« apps like
// Sophia »), jamais « the Sophia app » ni « l'appli Sophia ».

import type { Langue } from "./api.ts";

export const LEGENDE_APP: Record<Langue, { texte: string; appli: string }> = {
  en: { texte: "learn, then scroll", appli: "(apps like Sophia)" },
  fr: { texte: "apprendre, puis scroller", appli: "(applis comme Sophia)" },
  de: { texte: "erst lernen, dann scrollen", appli: "(Apps wie Sophia)" },
  es: { texte: "aprender, luego scrollear", appli: "(apps como Sophia)" },
  it: { texte: "imparare, poi scrollare", appli: "(app come Sophia)" },
  tr: { texte: "önce öğren, sonra kaydır", appli: "(Sophia gibi uygulamalar)" },
};

/** Icône App Store de Sophia (1024 px), arrondie au rendu comme sur iOS. */
export const CHEMIN_ICONE = "assets/sophia_icone.jpg";

/** Rayon des coins d'une icône iOS, en part de son côté. */
export const RAYON_ICONE = 0.2237;
