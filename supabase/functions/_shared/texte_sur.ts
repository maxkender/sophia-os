/**
 * Du texte que PostgREST acceptera.
 *
 * Un « demi-emoji » (une moitié de paire UTF-16 restée seule) rend le corps
 * JSON invalide aux yeux de PostgREST : la requête échoue en PGRST102 « Empty
 * or invalid json » et la ligne n'est jamais écrite. Le 21/10 puis le 25/10,
 * un slideshow de @wroteinpink a échoué ainsi cinq fois de suite : son titre,
 * la légende TikTok coupée par `.slice(0, 160)`, s'arrêtait au milieu d'un
 * emoji. Toute légende ou titre venu de TikTok passe par ici avant d'être écrit.
 */

const MOITIE_SEULE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Le texte sans aucune moitié d'emoji orpheline. */
export function texteBienForme(texte: string): string {
  return texte.replace(MOITIE_SEULE, "");
}

/** Pareil, en laissant passer l'absence de texte. */
export function texteBienFormeOuNull(texte: string | null | undefined): string | null {
  return texte == null ? null : texteBienForme(texte);
}

/** Les `max` premières unités du texte, sans jamais couper un emoji en deux. */
export function couperTexte(texte: string, max: number): string {
  return texteBienForme(texte.slice(0, max));
}
