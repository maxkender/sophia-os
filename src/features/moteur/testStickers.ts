/**
 * Test à blanc de la règle stickers de l'import (fonction `test-stickers`) :
 * types, exécution parallèle bornée et bilan. Rien n'est écrit en base.
 */

export interface SlideshowStickerTest {
  id: string;
  titre: string | null;
  created_at: string;
  slides: Array<{ position: number; url: string }>;
}

export interface SlideStickerResultat {
  position: number;
  url: string;
  sticker: boolean;
  /** Texte que l'OCR d'import aurait gardé ("" pour une slide à sticker). */
  texte: string;
  erreur?: string;
}

export interface StickerTestResultat {
  id: string;
  sticker: boolean;
  slides: SlideStickerResultat[];
}

export type EtatStickerTest =
  | { statut: "attente" }
  | { statut: "encours" }
  | { statut: "ok"; resultat: StickerTestResultat }
  | { statut: "erreur"; message: string };

/** Slideshows analysés en même temps (chacun lit ses slides en parallèle côté serveur). */
export const CONCURRENCE_STICKERS = 8;

export const N_STICKERS_DEFAUT = 100;
export const N_STICKERS_MAX = 200;

/**
 * Lance `tache` sur chaque élément, au plus `concurrence` à la fois. Une tâche
 * qui échoue n'arrête pas les autres : c'est à elle de consigner son erreur.
 */
export async function enParallele<T>(
  items: readonly T[],
  concurrence: number,
  tache: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < items.length) {
      const i = suivant;
      suivant += 1;
      try {
        await tache(items[i], i);
      } catch {
        // consignée par la tâche
      }
    }
  };
  const n = Math.max(1, Math.min(concurrence, items.length));
  await Promise.all(Array.from({ length: n }, ouvrier));
}

export interface BilanStickers {
  total: number;
  termines: number;
  stickers: number;
  propres: number;
  erreurs: number;
  /** Slides à sticker, tous slideshows confondus. */
  slidesSticker: number;
}

export function bilanStickers(
  slideshows: readonly SlideshowStickerTest[],
  etats: Readonly<Record<string, EtatStickerTest>>,
): BilanStickers {
  const bilan: BilanStickers = {
    total: slideshows.length,
    termines: 0,
    stickers: 0,
    propres: 0,
    erreurs: 0,
    slidesSticker: 0,
  };
  for (const s of slideshows) {
    const etat = etats[s.id];
    if (etat?.statut === "ok") {
      bilan.termines += 1;
      if (etat.resultat.sticker) bilan.stickers += 1;
      else bilan.propres += 1;
      bilan.slidesSticker += etat.resultat.slides.filter((x) => x.sticker).length;
    } else if (etat?.statut === "erreur") {
      bilan.termines += 1;
      bilan.erreurs += 1;
    }
  }
  return bilan;
}

/** Rang d'affichage : stickers d'abord, puis erreurs, en cours, propres. */
function rang(etat: EtatStickerTest | undefined): number {
  if (etat?.statut === "ok") return etat.resultat.sticker ? 0 : 3;
  if (etat?.statut === "erreur") return 1;
  return 2;
}

/** Slideshows dans l'ordre d'affichage (ordre du tirage à rang égal) ; `stickersSeuls` filtre. */
export function ordreAffichage(
  slideshows: readonly SlideshowStickerTest[],
  etats: Readonly<Record<string, EtatStickerTest>>,
  stickersSeuls = false,
): SlideshowStickerTest[] {
  return slideshows
    .map((s, i) => ({ s, i, r: rang(etats[s.id]) }))
    .filter(({ r }) => !stickersSeuls || r === 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ s }) => s);
}
