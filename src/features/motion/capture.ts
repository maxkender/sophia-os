// Capture Sophia de la page Motion : fichiers acceptés.

export const TYPES_CAPTURE = ["image/png", "image/jpeg", "image/webp"];

/** Premier fichier PNG / JPEG / WebP d'une liste (dépôt ou sélecteur), sinon null. */
export function premiereCapture(files: FileList | readonly File[] | null | undefined): File | null {
  return Array.from(files ?? []).find((f) => TYPES_CAPTURE.includes(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)) ?? null;
}
