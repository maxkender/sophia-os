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
 *  - `sansConcurrent` : toute mention qui reste est retirée avant que le deck
 *    ne parte. LIGNE par ligne d'abord (chaque retour à la ligne est un
 *    paragraphe), puis phrase par phrase et parenthèse par parenthèse dans la
 *    ligne : sur un texte d'OCR coupé en lignes, une phrase ou une parenthèse
 *    à cheval sur deux lignes n'est retirée qu'à moitié. Pour une application
 *    autre que Sophia, une seconde slide concurrente (ou une couverture qui en
 *    cite une) rend donc le contenu inéligible plutôt que nettoyé
 *    (`motifConcurrenceRefusee`, deck_application.ts).
 *
 * Un motif PAR APPLICATION (`motifConcurrentApplication`) : les concurrents
 * d'Unswipe sont les applis de temps d'écran, ceux de micabo les applis
 * d'étude, ceux d'Atala les applis de plans de course, ceux
 * d'Artura les applis d'art. Sans motif passé,
 * toutes les fonctions gardent celui de Sophia : les appels Sophia (import,
 * composer) ne changent pas.
 *
 * Ajouter une application : écrire son motif ici et l'inscrire dans
 * `MOTIFS_PAR_APPLICATION`. Une application du catalogue
 * (`catalogue_applications.ts`) sans motif fait échouer `concurrents_test.ts`.
 */

/**
 * Noms d'applis concurrentes de Sophia. « readup » collé seulement : « read up »
 * est de l'anglais courant. « turboresume » (aussi « TurboResume.ai ») : la
 * source du label RH (@careerswemma) le cite dans 117 contenus sur 228, et
 * 57 passages RH sur 139 sont partis avec (octobre 2026). Jamais « turbo »
 * seul (« en mode turbo », « disturbo »). Label beau_smart_girl (octobre
 * 2026) : « bycat » (appli d'étude de @mia.study5, 45 passages publiés avec)
 * et « actualize » (« Actualize: Daily Microlearning » de @smarter_with_sara,
 * 79 slides du stock, toutes l'appli), sauf le verbe : jamais après « self- »
 * ni devant un possessif ou un article (« actualize your potential »). Label
 * smart_girl (octobre 2026) : « unscroll » (il bloque les applis et propose
 * un article à lire, 30 passages Sophia publiés avec), « elqo » (« elqo.app »,
 * appli d'élocution en 5 minutes par jour, 87 passages publiés avec) et
 * « kodi ai » (appli d'élocution glissée par @b3tteryou, 24 contenus), jamais
 * « kodi » seul : « cheat kodi » veut dire « codes » en slovène et en croate.
 * « noctua » (« Noctua: Daily Insights », appli de micro-lecture de
 * @smarterhabitsdaily, sur la slide promo de presque tous ses posts, 21/10).
 */
export const MOTIF_CONCURRENT =
  /\b(vent[\s-]?now|readup|turbo[\s-]?resume|bycat|unscroll|elqo|noctua|kodi[\s-]+(?:a[il]|app)|(?<!self[\s-])actualize(?!\s+(?:your|my|our|their|his|her|its|the|a|an|yourself|myself|ourselves|themselves|oneself)\b))\b/i;

/**
 * Concurrents d'Unswipe : ceux de Sophia + les applis de temps d'écran.
 * Plusieurs noms sont des mots courants, d'où les conditions (mesurées sur
 * les 77 212 slides du stock, octobre 2026) :
 *  - « unscroll » : bloque les applis et propose un article à lire (97 slides,
 *    82 contenus) — le concurrent le plus cité du stock. Il l'est aussi de
 *    Sophia : il vient donc de MOTIF_CONCURRENT ;
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

/** Bornes de mot Unicode (drapeau `u`) : `\b` ne connaît que l'ASCII. */
const DEBUT_MOT = String.raw`(?<![\p{L}\p{N}_])`;
const FIN_MOT = String.raw`(?![\p{L}\p{N}_])`;
const motEntier = (motif: string) => `${DEBUT_MOT}(?:${motif})${FIN_MOT}`;

/**
 * Concurrents de micabo : ceux de Sophia + les applis d'étude. C'est la table
 * `concurrents` de micabo-os au 2026-10-09 (19 noms), mêmes motifs, en mots
 * entiers Unicode comme là-bas : « Wilgo'dan », « WILGO-Methode »,
 * « Flashcards/Anki » sont des mentions, « Ranking » ou « speech » non.
 * Conditions, mesurées sur les slides de micabo-os (decks et OCR, 2026-10-09) :
 *  - « anki » : jamais après « şu / o / bu / her » — « şu anki rekor », « o anki
 *    halim » sont du turc courant (« actuel », « de ce moment-là »), et micabo a
 *    des comptes turcs. Prix : « Notion o Anki » (espagnol) passe ;
 *  - « astra » (ou « astra ai ») : jamais après « ad » (« per aspera ad astra ») ;
 *  - « studysmarter » collé seulement : « study smarter » est une expression ;
 *  - PeECH (lecture audio) en fait partie : sa slide devient la pub micabo,
 *    réécrite en entier — le prompt `placement_micabo` interdit l'audio.
 * Sur ce stock, les plus cités : Wilgo (83 slides, source @jeanne.wilgo), PeECH
 * (29), Quizlet (11), ElibroAI (8), Knowunity et Anki (5).
 */
export const MOTIF_CONCURRENT_MICABO = new RegExp(
  [
    MOTIF_CONCURRENT.source,
    ...[
      "wilgo",
      String.raw`(?<!(?:^|[^\p{L}\p{N}_])ad\s+)astra(?:\s?ai)?`,
      "knowunity",
      "quizlet",
      String.raw`(?<!(?:^|[^\p{L}\p{N}_])(?:şu|o|bu|her)\s+)anki`,
      "studysmarter",
      "studocu",
      "brainly",
      String.raw`gauth(?:math)?`,
      "photomath",
      String.raw`turbo\s?ai`,
      String.raw`study\s?fetch`,
      "revisely",
      "mindgrasp",
      "flashka",
      String.raw`elibro(?:\s?ai|\.ai)?`,
      "aistote",
      "nerdmask",
      "peech",
    ].map(motEntier),
  ].join("|"),
  "iu",
);

/**
 * Concurrents d'Atala (course à pied) : ceux de Sophia + les applis qui
 * donnent un plan d'entraînement ou coachent la course. Première liste, écrite
 * le 19/11 AVANT tout stock de running : à mesurer sur les slides des premiers
 * labels importés (faux positifs, applis oubliées), comme l'ont été celles
 * d'Unswipe et de micabo.
 * Conditions, pour ne pas prendre un mot courant ou une chaussure :
 *  - « nike run club » ou « NRC » ; jamais « nike running » seul (« my nike
 *    running shoes ») ;
 *  - « adidas running app » ou « runtastic » ; jamais « adidas running » seul ;
 *  - « runmotion », « trainingpeaks », « runsmart », « runcoach », « mapmyrun »
 *    collés seulement (« run smart, not hard », « your training peaks at
 *    week 10 ») ;
 *  - « couch to 5k » sous toutes ses formes (« couch 2 5k », « c25k »).
 * PAS Strava ni Garmin / Apple Watch seuls : ce sont l'endroit où l'on
 * enregistre sa sortie et la montre, cités comme outils dans le conseil, pas
 * une appli qui prend la place d'Atala. « garmin coach » (les plans), si.
 */
export const MOTIF_CONCURRENT_ATALA = new RegExp(
  [
    MOTIF_CONCURRENT.source,
    ...[
      "runna",
      String.raw`nike\s+run\s?club`,
      "nrc",
      String.raw`couch\s+(?:to|2)\s+5\s?k`,
      "c25k",
      "runkeeper",
      String.raw`adidas\s+running\s+app`,
      "runtastic",
      "coopah",
      String.raw`kiprun\s+pacer`,
      String.raw`campus\s+coach`,
      "runmotion",
      "trainingpeaks",
      String.raw`garmin\s+coach`,
      String.raw`none\s+to\s+run`,
      "trenara",
      "runsmart",
      "runcoach",
      "mapmyrun",
      String.raw`zombies,?\s+run`,
      String.raw`run\s+with\s+hal`,
    ].map(motEntier),
  ].join("|"),
  "iu",
);

/**
 * Concurrents d'Artura (une œuvre d'art par jour, son histoire, des jeux pour
 * l'œil) : ceux de Sophia + les applis d'art. Première liste, écrite le 23/11
 * AVANT tout stock d'art : à mesurer sur les slides des premiers labels
 * importés, comme l'ont été celles d'Unswipe et de micabo.
 * Conditions, pour ne pas prendre un mot courant :
 *  - « dailyart » collé, ou « daily art app » ; jamais « daily art » seul
 *    (« my daily art habit ») ;
 *  - « google arts & culture » (et, and, und, y, e) ; jamais « google » seul ;
 *  - « artsy » suivi de « app » ou « .net », ou « app Artsy » ; jamais
 *    l'adjectif (« an artsy girl ») ;
 *  - « magnus » suivi de « app » ou « art » ; jamais le prénom seul.
 * PAS les musées ni leurs sites (Louvre, MoMA, Met) : ce sont les lieux où
 * sont les œuvres, cités dans le conseil.
 */
export const MOTIF_CONCURRENT_ARTURA = new RegExp(
  [
    MOTIF_CONCURRENT.source,
    ...[
      "dailyart",
      String.raw`daily\s+art\s+app`,
      "smartify",
      String.raw`google\s+arts?\s*(?:&|and|et|und|y|e)\s*culture`,
      String.raw`artsy\s*(?:app|\.net)`,
      String.raw`(?:app|appli|application)\s+artsy`,
      String.raw`magnus\s+(?:app|art)`,
      "artivive",
    ].map(motEntier),
  ].join("|"),
  "iu",
);

/**
 * Le motif de chaque application hors Sophia (qui garde `MOTIF_CONCURRENT`).
 * Une application du catalogue DOIT avoir sa ligne ici, même si elle n'a pour
 * l'instant que les concurrents de Sophia.
 */
export const MOTIFS_PAR_APPLICATION: Readonly<Record<string, RegExp>> = {
  unswipe: MOTIF_CONCURRENT_UNSWIPE,
  micabo: MOTIF_CONCURRENT_MICABO,
  atala: MOTIF_CONCURRENT_ATALA,
  artura: MOTIF_CONCURRENT_ARTURA,
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
 * Un texte sans mention ressort à l'identique. Le travail se fait LIGNE par
 * ligne : une phrase ou une parenthèse coupée sur deux lignes (texte d'OCR)
 * n'est retirée qu'à moitié.
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
