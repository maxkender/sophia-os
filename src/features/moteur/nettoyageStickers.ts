/**
 * Nettoyage stickers d'un label (page Slideshows) : scanner tous ses
 * slideshows avec l'OCR d'import (fonction `test-stickers`, à blanc), puis
 * retirer ceux qui portent un sticker PUB (fonction `nettoyer-stickers`) et
 * remplacer leurs posts du jour (`revoquer-post`). Les stickers de contenu
 * restent : ils portent la recommandation.
 * Pods, tier A ou mieux et nos applis sont écartés côté serveur.
 */

import type { SlideshowStickerTest, StickerTestResultat } from "./testStickers";

export interface SlideshowLabelSticker extends SlideshowStickerTest {
  tier: string | null;
}

export interface SlideshowsLabelStickers {
  /** Candidats : valides, hors pods, sous le tier A, avec images brutes. */
  slideshows: SlideshowLabelSticker[];
  /** Slideshows valides du label. */
  total: number;
  pods: number;
  /** Tier A ou mieux (Sophia ou une autre application) : gardés. */
  proteges: number;
  sansImages: number;
}

export interface ResultatNettoyageStickers {
  retires: string[];
  ignores: Array<{ id: string; raison: string }>;
  postsARemplacer: string[];
}

/** Appels de retrait : la fonction en accepte au plus 100 à la fois. */
export const LOT_NETTOYAGE = 100;
/** Remplacements de posts menés en même temps (chacun relance une assignation). */
export const CONCURRENCE_REMPLACEMENT = 2;

/** Le slideshow porte au moins un sticker PUB. */
export function aRetirer(resultat: StickerTestResultat): boolean {
  return resultat.slides.some((s) => s.sticker === "pub");
}

/** Découpe une liste en lots de `taille`. */
export function enLots<T>(items: readonly T[], taille: number): T[][] {
  const n = Math.max(1, Math.floor(taille));
  const lots: T[][] = [];
  for (let i = 0; i < items.length; i += n) lots.push(items.slice(i, i + n));
  return lots;
}
