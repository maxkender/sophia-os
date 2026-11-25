// La présentation avant le formulaire (24/11, Max) : la logique sans React (vue une fois par session, texte tapé).

/** Le nombre d'écrans de la présentation (textes onb.1 à onb.8 des fichiers de langue ; 8 depuis le 24/11). */
export const NB_ECRANS = 8;

/** Les clés de texte de la présentation, toutes présentes dans chaque fichier de langue. */
export const CLES_PRESENTATION = [
  "onb.label", "onb.progress", "onb.skip", "onb.continue", "onb.back", "onb.replay", "onb.pay", "onb.faq", "onb.apply", "onb.video",
  ...Array.from({ length: NB_ECRANS }, (_, i) => [`onb.${i + 1}.title`, `onb.${i + 1}.body`]).flat(),
];

const CLE_SESSION = "join_presentation";

function session(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Vrai si la présentation a déjà été vue (ou passée) dans cette session. */
export function presentationVue(stockage: Storage | null = session()): boolean {
  try {
    return stockage?.getItem(CLE_SESSION) === "1";
  } catch {
    return false;
  }
}

export function marquerPresentationVue(stockage: Storage | null = session()): void {
  try {
    stockage?.setItem(CLE_SESSION, "1");
  } catch {
    // stockage indisponible : la présentation sera remontrée, sans gravité
  }
}

/** Le titre puis le texte, tapés jusqu'au caractère n (le titre s'écrit d'abord). */
export function texteTape(titre: string, corps: string, n: number): { titre: string; corps: string; fini: boolean } {
  const t = [...titre];
  const c = [...corps];
  const k = Math.max(0, Math.floor(n));
  return {
    titre: t.slice(0, k).join(""),
    corps: c.slice(0, Math.max(0, k - t.length)).join(""),
    fini: k >= t.length + c.length,
  };
}

/** Longueur totale à taper, en caractères (les accents et lettres grecques/cyrilliques comptent pour un). */
export function longueurTape(titre: string, corps: string): number {
  return [...titre].length + [...corps].length;
}

/**
 * 25/11 (test persona) : le nombre de caractères écrits à chaque pas de 30 ms. Au moins 5 (≈ 165 caractères par
 * seconde, 2,5 fois plus vite qu'avant), et plus pour un long texte : un écran s'écrit en 3 secondes au plus.
 */
export function pasEcriture(total: number): number {
  return Math.max(5, Math.ceil(Math.max(0, total) / 100));
}

export function mouvementReduit(): boolean {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/** Une ligne du texte : son texte affiché et sa position (en caractères) dans le texte entier. */
export interface LigneCorps {
  texte: string;
  debut: number;
}

/** Un paragraphe (une ligne) ou une liste numérotée (lignes « 1. … » qui se suivent). */
export type BlocCorps = { liste: false; ligne: LigneCorps } | { liste: true; lignes: LigneCorps[] };

/**
 * Le texte d'un écran, découpé par lignes : les lignes « 1. … », « 2. … » qui se suivent forment une vraie liste
 * (leur numéro est retiré : la liste le donne). Les positions comptent les caractères comme texteTape (le numéro
 * et les retours à la ligne compris), pour taper ligne après ligne.
 */
export function decouperCorps(corps: string): BlocCorps[] {
  const blocs: BlocCorps[] = [];
  let pos = 0;
  for (const brute of corps.split("\n")) {
    const num = /^\s*\d+[.)]\s+/.exec(brute);
    if (num) {
      const ligne = { texte: brute.slice(num[0].length), debut: pos + [...num[0]].length };
      const dernier = blocs[blocs.length - 1];
      if (dernier?.liste) dernier.lignes.push(ligne);
      else blocs.push({ liste: true, lignes: [ligne] });
    } else if (brute.trim()) {
      blocs.push({ liste: false, ligne: { texte: brute, debut: pos } });
    }
    pos += [...brute].length + 1;
  }
  return blocs;
}

/** La partie déjà tapée d'une ligne quand `n` caractères du texte sont tapés. */
export function ligneTapee(ligne: LigneCorps, n: number): string {
  return [...ligne.texte].slice(0, Math.max(0, n - ligne.debut)).join("");
}
