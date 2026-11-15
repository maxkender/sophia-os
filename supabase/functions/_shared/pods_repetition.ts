/**
 * Images et sons répétés par un podz (0671, 12/11).
 *
 * Plaintes des posteurs du 12/11 : « toujours les mêmes photos, toujours la même
 * musique ». Le podz alpha_male_yellow avait utilisé 102 images de sa banque
 * (2 232) pour 1 488 slides en 14 jours, chacune environ 15 fois ; le podz
 * weird_alpha mettait le même son sur 132 contenus sur 132, le podz RH sur 126
 * sur 180. Le guichet refuse maintenant :
 *   - une image déjà livrée par le podz depuis `imagesJours` jours ;
 *   - un son déjà présent sur `musiqueMax` des `musiqueFenetre` dernières
 *     livraisons du podz (plus d'un tiers).
 * La liste d'images donnée au podz (`action: images`) écarte déjà les images
 * récentes. Module pur : les lectures en base sont dans `pods/index.ts`.
 */

export interface ReglesRepetition {
  /** Une image livrée par le podz ne revient pas avant ce nombre de jours. */
  imagesJours: number;
  /** Fenêtre des dernières livraisons regardées pour le son. */
  musiqueFenetre: number;
  /** Au-delà de ce nombre de livraisons avec le même son dans la fenêtre : refus. */
  musiqueMax: number;
}

export const REGLES_REPETITION_DEFAUT: Readonly<ReglesRepetition> = Object.freeze({
  imagesJours: 14,
  musiqueFenetre: 20,
  musiqueMax: 6,
});

function entier(v: unknown, defaut: number, min: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : defaut;
}

/** `reglages.bleo.podz.repetition` ; valeurs absentes ou fausses : les défauts. */
export function lireReglesRepetition(valeur: unknown): ReglesRepetition {
  const r = (valeur && typeof valeur === "object" ? valeur : {}) as Record<string, unknown>;
  const d = REGLES_REPETITION_DEFAUT;
  return {
    imagesJours: entier(r.images_jours, d.imagesJours, 0),
    musiqueFenetre: entier(r.musique_fenetre, d.musiqueFenetre, 1),
    musiqueMax: entier(r.musique_max, d.musiqueMax, 1),
  };
}

/** Les images (media_id) de tous les decks d'une livraison. */
export function imagesDesDecks(decks: unknown): string[] {
  const ids = new Set<string>();
  if (!decks || typeof decks !== "object") return [];
  for (const deck of Object.values(decks as Record<string, unknown>)) {
    const slides = (deck as { slides?: unknown })?.slides;
    if (!Array.isArray(slides)) continue;
    for (const s of slides) {
      const id = (s as { media_id?: unknown })?.media_id;
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Ce qui identifie un son : l'identifiant TikTok du son quand l'URL en porte
 * un, sinon l'URL nettoyée. Sans URL, un titre générique (« original sound »)
 * ne dit pas quel son c'est : pas de clé, pas de contrôle.
 */
export function cleMusique(url: unknown, titre: unknown): string | null {
  const u = typeof url === "string" ? url.trim().toLowerCase() : "";
  if (u) {
    const id = u.match(/\/music\/[^?#]*?-(\d{6,})/)?.[1];
    if (id) return `tiktok:${id}`;
    return u.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
  const t = typeof titre === "string" ? titre.trim().toLowerCase() : "";
  if (!t || /^(original sound|son original|som original|sonido original|suono originale|originalton)/.test(t)) return null;
  return `titre:${t}`;
}

/** Combien des livraisons récentes portent ce son. */
export function compterMemeMusique(
  cle: string | null,
  recentes: ReadonlyArray<{ musique_url?: unknown; musique_titre?: unknown }>,
): number {
  if (!cle) return 0;
  return recentes.filter((l) => cleMusique(l.musique_url, l.musique_titre) === cle).length;
}
