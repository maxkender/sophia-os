/**
 * Retouche d'une photo « propre » : recouvre une bande en bas de l'image avec la
 * bande juste au-dessus (comme un tampon de clonage).
 *
 * Pourquoi : certains comptes sources signent toutes leurs slides au même
 * endroit, en petit, en bas au centre (« @Don.LoQ » le 14/11). Le nettoyage de
 * l'import efface le gros texte mais rate souvent cette signature, et la
 * vérification du texte restant est coupée (0156). Sur leurs fonds unis
 * (textures béton, papier), recopier la bande du dessus ne se voit pas.
 *
 * Pur : travaille sur les pixels RGBA décodés, sans réseau.
 */

/** Fraction de la hauteur recouverte par défaut, et ses bornes. */
export const BANDE_DEFAUT = 0.07;
export const BANDE_MIN = 0.02;
export const BANDE_MAX = 0.2;

/** Hauteur en pixels de la bande, bornée : au moins 1 px, au plus un tiers de l'image. */
export function hauteurBande(hauteur: number, fraction: number): number {
  const f = Math.min(Math.max(Number.isFinite(fraction) ? fraction : BANDE_DEFAUT, BANDE_MIN), BANDE_MAX);
  return Math.max(1, Math.min(Math.round(hauteur * f), Math.floor(hauteur / 3)));
}

/**
 * Recopie, en place, les `hb` lignes au-dessus de la bande sur la bande du bas.
 * `data` : pixels RGBA (4 octets par pixel), ligne par ligne.
 */
export function recouvrirBandeBas(data: Uint8Array, largeur: number, hauteur: number, fraction = BANDE_DEFAUT): number {
  const hb = hauteurBande(hauteur, fraction);
  const ligne = largeur * 4;
  for (let y = hauteur - hb; y < hauteur; y++) {
    const source = (y - hb) * ligne;
    data.copyWithin(y * ligne, source, source + ligne);
  }
  return hb;
}

/** Chemin de la version retouchée : même dossier, suffixe fixe (relancer réécrit le même fichier). */
export function cheminRetouche(storagePath: string): string {
  return `${storagePath.replace(/(-bande)?\.[^./]+$/, "")}-bande.jpg`;
}
