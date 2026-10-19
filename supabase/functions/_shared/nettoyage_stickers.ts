/**
 * Nettoyage stickers d'un label : quels slideshows déjà importés retirer.
 *
 * Un slideshow est retiré quand une de ses slides porte un sticker PUB (app,
 * marque, site d'un concurrent). Les stickers de contenu (livre, vidéo,
 * article) restent : ils portent la recommandation. Sauf, toujours :
 *   - un contenu de pod (`contenus.pod`, passe-droit) ;
 *   - un contenu au tier A ou mieux, pour Sophia (`contenus.tier`) ou pour une
 *     autre application (`contenu_application_tier_etat`, lignes éligibles) ;
 *   - nos applis (Sophia, UnSwipe, Micabo) : l'OCR ne les compte pas comme
 *     sticker du tout (consigne de `ocrSlideImport`).
 * Retirer = `statut = rejete` : le slideshow sort de toutes les réserves.
 */

/** Tiers gardés quoi qu'il arrive : A et au-dessus. */
export const TIERS_PROTEGES: ReadonlySet<string> = new Set(["A", "S", "S+"]);

/** Un des tiers (Sophia ou une autre application) vaut A ou mieux. */
export function tierProtege(tiers: ReadonlyArray<string | null | undefined>): boolean {
  return tiers.some((t) => typeof t === "string" && TIERS_PROTEGES.has(t.trim().toUpperCase()));
}

/** Motif écrit sur le contenu retiré (`import_erreur`). */
export function motifRetrait(libelleLabel: string | null): string {
  return `Sticker pub (nettoyage stickers${libelleLabel ? ` du label ${libelleLabel}` : ""}) — retiré`;
}
