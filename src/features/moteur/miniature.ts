/**
 * Miniature d'une image du Storage Supabase, redimensionnée côté serveur : une
 * slide de 1,6 Mo tombe à ~3 Ko (webp). Le calendrier HM en affiche des
 * centaines (ticket Aram, « change 2 ») ; les originaux seraient intenables.
 * Une URL hors Storage est rendue telle quelle.
 */
export function miniatureStorage(url: string | null | undefined, largeur = 96): string | null {
  if (!url) return null;
  const marque = "/storage/v1/object/public/";
  if (!url.includes(marque)) return url;
  const sansParams = url.split("?")[0];
  return `${sansParams.replace(marque, "/storage/v1/render/image/public/")}?width=${largeur}&quality=50`;
}
