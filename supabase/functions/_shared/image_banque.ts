/**
 * Contrôles purs d'une image qui entre dans la banque d'un label : JPEG
 * vertical 9:16, sans métadonnées, avec sa légende en anglais. Servent au
 * guichet des podz (`ajouter_image`) et à la banque venue de Pinterest
 * (fonction Edge `banque`, 0771). Sortis de `pods.ts`, qui les réexporte, pour
 * que `banque` n'embarque pas tout le guichet.
 */

/** SHA-256 hexadécimal (jeton d'agent comparé à `pods.jeton_hash`). */
export async function sha256Hex(texte: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Segments de métadonnées encore présents dans un JPEG (vide = propre) : APP1 à
 * APP15 (EXIF/XMP, ICC, C2PA/JUMBF, Photoshop, Adobe) et commentaires. Même règle
 * que pods/page-blanche/atelier/metadonnees.ts : un dépôt qui en porte est refusé.
 */
export function metadonneesJpeg(jpeg: Uint8Array): string[] | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null; // pas un JPEG
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

/**
 * Une image qu'un podz ajoute à la banque propre de son label (action
 * `ajouter_image`, demande d'Adrien du 13/11 : les images Seedream du podz
 * Plony) : un JPEG vertical (9:16 environ), sans aucune métadonnée (ni C2PA,
 * ni XMP, ni EXIF), avec sa légende en anglais, que `images --cherche` lit.
 * Au plus `parJour` images par podz sur 24 h.
 */
export const BANQUE_PODZ = {
  octetsMax: 4_000_000,
  parJour: 40,
  largeurMin: 720,
  ratioMin: 0.5,
  ratioMax: 0.6,
  legendeMax: 300,
} as const;

/** Largeur et hauteur d'un JPEG, lues dans son SOF sans décoder l'image (null si absent). */
export function dimensionsJpeg(jpeg: Uint8Array): { l: number; h: number } | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 <= jpeg.length && jpeg[i] === 0xff) {
    const m = jpeg[i + 1];
    if (m === 0xda) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: (jpeg[i + 5] << 8) | jpeg[i + 6], l: (jpeg[i + 7] << 8) | jpeg[i + 8] };
    }
    i += 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
  }
  return null;
}

/**
 * Les erreurs du fichier seul (vide = accepté) : un JPEG vertical 9:16, assez
 * large, sans aucune métadonnée. La banque venue de Pinterest s'arrête là : sa
 * description est écrite par l'OS (`capturerCaptionImage`).
 */
export function controlerJpegBanque(octets: Uint8Array): string[] {
  const erreurs: string[] = [];
  if (octets.length > BANQUE_PODZ.octetsMax) {
    erreurs.push(`image de ${(octets.length / 1_000_000).toFixed(1)} Mo (${BANQUE_PODZ.octetsMax / 1_000_000} Mo au plus)`);
  }
  const restes = metadonneesJpeg(octets);
  if (restes === null) return [...erreurs, "pas un JPEG"];
  if (restes.length) erreurs.push(`métadonnées ${restes.join(", ")} : réencode l'image sans métadonnées (ni C2PA, ni XMP, ni EXIF)`);
  const d = dimensionsJpeg(octets);
  if (!d || !d.l || !d.h) erreurs.push("dimensions illisibles");
  else {
    if (d.l < BANQUE_PODZ.largeurMin) erreurs.push(`${d.l} px de large (${BANQUE_PODZ.largeurMin} au moins)`);
    const ratio = d.l / d.h;
    if (ratio < BANQUE_PODZ.ratioMin || ratio > BANQUE_PODZ.ratioMax) erreurs.push(`format ${d.l}×${d.h} : image verticale 9:16 attendue`);
  }
  return erreurs;
}

/** Les erreurs d'une image à ajouter à la banque d'un label, légende comprise (vide = acceptée). */
export function controlerImageBanque(octets: Uint8Array, legende: string): string[] {
  const erreurs = controlerJpegBanque(octets);
  if (erreurs.includes("pas un JPEG")) return erreurs;
  const l = legende.trim();
  if (l.split(/\s+/).filter((m) => /[a-z]{3,}/i.test(m)).length < 3) {
    erreurs.push("legende : décris l'image en anglais, en 3 mots au moins (elle sert à images --cherche)");
  }
  if (l.length > BANQUE_PODZ.legendeMax) erreurs.push(`legende de ${l.length} caractères (${BANQUE_PODZ.legendeMax} au plus)`);
  return erreurs;
}
