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

/** Titre court d'un slideshow pour le journal. */
function titreCourt(s: { id: string; titre: string | null }): string {
  const t = (s.titre ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > 60 ? `${t.slice(0, 57)}…` : t) : s.id.slice(0, 8);
}

/** Ligne du journal pour un slideshow analysé. */
export function ligneAnalyse(
  s: { id: string; titre: string | null },
  etat: { statut: "ok"; resultat: StickerTestResultat } | { statut: "erreur"; message: string },
): string {
  if (etat.statut === "erreur") return `⚠ ${titreCourt(s)} — erreur : ${etat.message}`;
  const pubs = etat.resultat.slides.filter((x) => x.sticker === "pub").map((x) => x.position);
  return pubs.length > 0
    ? `✗ PUB slide${pubs.length > 1 ? "s" : ""} ${pubs.join(", ")} — ${titreCourt(s)}`
    : `✓ ${titreCourt(s)}`;
}

/** « tier A ou mieux ×5, pod ×1 » : raisons des slideshows que le serveur a laissés. */
export function resumeIgnores(ignores: ReadonlyArray<{ raison: string }>): string {
  const compte = new Map<string, number>();
  for (const i of ignores) compte.set(i.raison, (compte.get(i.raison) ?? 0) + 1);
  return [...compte].map(([raison, n]) => `${raison} ×${n}`).join(", ");
}

/** Durée en m:ss (ou h:mm:ss au-delà d'une heure). */
export function formatDuree(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Temps restant estimé au rythme moyen depuis le début, ou null tant qu'on n'a rien fini. */
export function tempsRestant(fait: number, total: number, ecouleMs: number): number | null {
  if (fait <= 0 || total <= fait) return fait >= total && total > 0 ? 0 : null;
  return (ecouleMs / fait) * (total - fait);
}
