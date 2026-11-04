// Retrait des métadonnées d'un JPEG, sans réencodage : on ne garde que l'en-tête
// JFIF (APP0) et les segments nécessaires au décodage. Tout le reste part :
// EXIF/XMP (APP1), profil ICC (APP2), C2PA/JUMBF (APP11), Photoshop (APP13),
// Adobe (APP14), commentaires (COM).

export function retirerMetadonnees(jpeg: Uint8Array): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("pas un JPEG");
  const morceaux: Uint8Array[] = [jpeg.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) throw new Error(`segment JPEG inattendu à ${i}`);
    const marqueur = jpeg[i + 1];
    if (marqueur === 0xda) {
      morceaux.push(jpeg.subarray(i)); // début des données image : tout le reste
      break;
    }
    const longueur = (jpeg[i + 2] << 8) | jpeg[i + 3];
    const fin = i + 2 + longueur;
    const estAppN = marqueur >= 0xe0 && marqueur <= 0xef;
    const garder = (estAppN && marqueur === 0xe0) || (!estAppN && marqueur !== 0xfe);
    if (garder) morceaux.push(jpeg.subarray(i, fin));
    i = fin;
  }
  return Buffer.concat(morceaux);
}

/** Liste les segments de métadonnées encore présents (vide = propre). */
export function metadonneesRestantes(jpeg: Uint8Array): string[] {
  const restes: string[] = [];
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
    const m = jpeg[i + 1];
    if (m === 0xda) break;
    const longueur = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) restes.push(`0x${m.toString(16)}`);
    i += 2 + longueur;
  }
  return restes;
}
