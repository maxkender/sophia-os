// La présentation avant le formulaire (24/11, Max) : la logique sans React (vue une fois par session, texte tapé).

/** Le nombre d'écrans de la présentation (textes onb.1 à onb.6 des fichiers de langue). */
export const NB_ECRANS = 6;

/** Les clés de texte de la présentation, toutes présentes dans chaque fichier de langue. */
export const CLES_PRESENTATION = [
  "onb.label", "onb.progress", "onb.skip", "onb.continue", "onb.back", "onb.replay", "onb.pay", "onb.faq", "onb.apply",
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

export function mouvementReduit(): boolean {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}
