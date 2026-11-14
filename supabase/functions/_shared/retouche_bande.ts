/**
 * Retouche d'une photo « propre » : retire une bande en bas de l'image en la
 * recadrant, sans rien décoder dans la fonction.
 *
 * Pourquoi : certains comptes sources signent toutes leurs slides au même
 * endroit, en petit, en bas au centre (« @Don.LoQ » le 14/11). Le nettoyage de
 * l'import efface le gros texte mais rate souvent cette signature, et la
 * vérification du texte restant est coupée (0156).
 *
 * Comment : deux passages par les transformations d'images de Supabase Storage
 * (`/storage/v1/render/image/…`, recadrage centré `resize=cover`), à partir des
 * dimensions de la photo (lues dans l'en-tête du JPEG, sans le décoder) :
 *   1. même largeur, hauteur moins deux bandes : enlève la bande du bas (et la
 *      même en haut) ;
 *   2. dimensions d'origine : revient au même format en rognant un peu les côtés.
 * Décoder et réencoder un JPEG en JavaScript dépassait le temps de calcul d'une
 * fonction Edge (WORKER_RESOURCE_LIMIT dès qu'il y en a plusieurs à la suite).
 *
 * Pur : seulement des calculs de tailles et de chemins.
 */

/** Fraction de la hauteur retirée en bas (et autant en haut), par défaut, et ses bornes. */
export const BANDE_DEFAUT = 0.07;
export const BANDE_MIN = 0.02;
export const BANDE_MAX = 0.15;

/** Plus grand côté accepté par les transformations de Supabase Storage. */
export const COTE_MAX = 2500;

/**
 * Les deux tailles de rendu pour une photo l × h : l'étape (bandes retirées) et
 * la finale (format d'origine). Ramenées sous COTE_MAX si besoin.
 */
export function recadrages(l: number, h: number, fraction: number): {
  etape: { l: number; h: number };
  finale: { l: number; h: number };
} {
  const f = Math.min(Math.max(Number.isFinite(fraction) ? fraction : BANDE_DEFAUT, BANDE_MIN), BANDE_MAX);
  const k = Math.min(1, COTE_MAX / Math.max(l, h));
  const L = Math.round(l * k), H = Math.round(h * k);
  return { etape: { l: L, h: Math.round(H * (1 - 2 * f)) }, finale: { l: L, h: H } };
}

/** URL de rendu d'un fichier public du bucket, recadré au centre à la taille voulue. */
export function urlRendu(base: string, bucket: string, path: string, largeur: number, hauteur: number, cle: string): string {
  const chemin = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/render/image/public/${bucket}/${chemin}?width=${largeur}&height=${hauteur}&resize=cover&quality=92&v=${encodeURIComponent(cle)}`;
}

/** Chemin de la version retouchée : même dossier, suffixe fixe. */
export function cheminRetouche(storagePath: string): string {
  return `${storagePath.replace(/(-bande(-etape)?)?\.[^./]+$/, "")}-bande.jpg`;
}

/** Chemin du fichier intermédiaire (après le premier recadrage), supprimé ensuite. */
export function cheminEtape(storagePath: string): string {
  return `${storagePath.replace(/(-bande(-etape)?)?\.[^./]+$/, "")}-bande-etape.jpg`;
}

/** Une photo déjà retouchée ne l'est pas deux fois (chaque passage rogne encore). */
export function dejaRetouchee(storagePath: string): boolean {
  return /-bande\.jpg$/.test(storagePath);
}
