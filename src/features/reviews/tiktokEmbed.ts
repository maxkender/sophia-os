/** Identifiant numérique TikTok (photo, vidéo, embed, ancien /v/), ou null. */
export function idTiktokDepuisUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  return (
    u.match(/\/(?:photo|video|embed\/v2)\/(\d+)/)?.[1] ??
    u.match(/\/v\/(\d+)/)?.[1] ??
    null
  );
}

/** Lien « Partager » de l'app : à résoudre avant d'embarquer. */
export function estLienCourtTiktok(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  return /\/\/(?:vm|vt)\.tiktok\.com\//i.test(u) || /tiktok\.com\/t\//i.test(u);
}

export function besoinResoudreTiktok(url: string | null | undefined): boolean {
  return Boolean(url) && estLienCourtTiktok(url) && !idTiktokDepuisUrl(url);
}

/** URL d'iframe embed officiel. Null si le lien n'est pas un post. */
export function urlEmbedTiktok(url: string | null | undefined): string | null {
  const id = idTiktokDepuisUrl(url);
  return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
}

export function urlEmbedTiktokDepuisId(id: string | null | undefined): string | null {
  return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
}
