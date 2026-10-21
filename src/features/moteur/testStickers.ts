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

/** Pub d'app ou de marque (rejet), sticker qui porte le contenu (importé), ou rien. */
export type FamilleSticker = "pub" | "contenu" | null;

export interface SlideStickerResultat {
  position: number;
  url: string;
  sticker: FamilleSticker;
  /** Texte que l'OCR d'import aurait gardé ("" pour une slide à sticker pub). */
  texte: string;
  erreur?: string;
}

export interface StickerTestResultat {
  id: string;
  /** Au moins une slide à sticker pub : le TikTok ne serait pas importé. */
  rejete: boolean;
  /** Au moins une slide à sticker de contenu (importé quand même). */
  contenu: boolean;
  slides: SlideStickerResultat[];
}

export type FiltreStickers = "tous" | "pub" | "contenu";

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
  /** Rejetés : au moins un sticker pub. */
  rejetes: number;
  /** Importés avec au moins un sticker de contenu (et aucune pub). */
  contenus: number;
  /** Importés sans aucun sticker. */
  propres: number;
  erreurs: number;
  slidesPub: number;
  slidesContenu: number;
}

export function bilanStickers(
  slideshows: readonly SlideshowStickerTest[],
  etats: Readonly<Record<string, EtatStickerTest>>,
): BilanStickers {
  const bilan: BilanStickers = {
    total: slideshows.length,
    termines: 0,
    rejetes: 0,
    contenus: 0,
    propres: 0,
    erreurs: 0,
    slidesPub: 0,
    slidesContenu: 0,
  };
  for (const s of slideshows) {
    const etat = etats[s.id];
    if (etat?.statut === "ok") {
      const r = etat.resultat;
      bilan.termines += 1;
      if (r.rejete) bilan.rejetes += 1;
      else if (r.contenu) bilan.contenus += 1;
      else bilan.propres += 1;
      bilan.slidesPub += r.slides.filter((x) => x.sticker === "pub").length;
      bilan.slidesContenu += r.slides.filter((x) => x.sticker === "contenu").length;
    } else if (etat?.statut === "erreur") {
      bilan.termines += 1;
      bilan.erreurs += 1;
    }
  }
  return bilan;
}

/** Rang d'affichage : rejetés (pub), stickers de contenu, erreurs, en cours, propres. */
function rang(etat: EtatStickerTest | undefined): number {
  if (etat?.statut === "ok") return etat.resultat.rejete ? 0 : etat.resultat.contenu ? 1 : 4;
  if (etat?.statut === "erreur") return 2;
  return 3;
}

/** Slideshows dans l'ordre d'affichage (ordre du tirage à rang égal), filtrés par famille. */
export function ordreAffichage(
  slideshows: readonly SlideshowStickerTest[],
  etats: Readonly<Record<string, EtatStickerTest>>,
  filtre: FiltreStickers = "tous",
): SlideshowStickerTest[] {
  const garde = filtre === "pub" ? 0 : filtre === "contenu" ? 1 : null;
  return slideshows
    .map((s, i) => ({ s, i, r: rang(etats[s.id]) }))
    .filter(({ r }) => garde === null || r === garde)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ s }) => s);
}
