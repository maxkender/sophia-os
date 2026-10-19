// L'élément UnSwipe qui remplace LEUR appli (« seeing progress (check bio) »
// avec l'icône de Journey) : l'icône UnSwipe et sa légende, par langue.
// Décision du 17/10 : « delete short-videos (UnSwipe app) », jamais
// « Insta, no Reels ». Le nom s'écrit UnSwipe, toujours avec le mot « app »
// de la langue (règle du prompt placement_unswipe).

import type { Langue } from "./api.ts";

export const LEGENDE_APP: Record<Langue, { texte: string; appli: string }> = {
  en: { texte: "delete short-videos", appli: "(UnSwipe app)" },
  fr: { texte: "supprimer les vidéos courtes", appli: "(appli UnSwipe)" },
  de: { texte: "Kurzvideos löschen", appli: "(UnSwipe-App)" },
  es: { texte: "borrar los vídeos cortos", appli: "(app UnSwipe)" },
  it: { texte: "eliminare i video brevi", appli: "(app UnSwipe)" },
  tr: { texte: "kısa videoları sil", appli: "(UnSwipe uygulaması)" },
};

/** Icône App Store d'UnSwipe (512 px), arrondie au rendu comme sur iOS. */
export const CHEMIN_ICONE = "assets/unswipe_icone.jpg";

/** Rayon des coins d'une icône iOS, en part de son côté. */
export const RAYON_ICONE = 0.2237;
