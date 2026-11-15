// Téléchargement des vidéos de la page Motion.

/** Nom du fichier téléchargé : sujet en kebab-case + langue (+ variante). */
export function nomFichierMotion(sujet: string, langue: string, variante?: string): string {
  const base = sujet
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return [base || "video", langue, variante].filter(Boolean).join("-") + ".mp4";
}

/** Les vidéos sont sur le stockage public Supabase (autre origine) : `download` seul y est ignoré par le
 *  navigateur, `?download=<nom>` fait renvoyer le fichier en pièce jointe. */
export function lienTelechargement(url: string, nom: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("download", nom);
    return u.toString();
  } catch {
    return url;
  }
}
