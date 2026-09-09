/** Identifiant numérique TikTok (photo ou vidéo), ou null. */
export function idTiktokDepuisUrl(url: string | null | undefined): string | null {
  return (url ?? "").match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? null;
}

/** URL d'iframe embed officiel. Null si le lien n'est pas un post. */
export function urlEmbedTiktok(url: string | null | undefined): string | null {
  const id = idTiktokDepuisUrl(url);
  return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
}
