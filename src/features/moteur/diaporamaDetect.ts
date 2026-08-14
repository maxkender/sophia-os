/** Un post TikTok est un diaporama (photo), pas une vidéo. */
export function estPostDiaporama(p: {
  webVideoUrl?: string | null;
  imageUrls?: string[] | null;
  isSlideshow?: boolean | null;
  coverUrls?: string[] | null;
}): boolean {
  if (p.isSlideshow) return true;
  if ((p.imageUrls?.length ?? 0) > 0) return true;
  if (/\/photo\//.test(p.webVideoUrl ?? "")) return true;
  if ((p.coverUrls ?? []).some((u) => /photomode/i.test(u))) return true;
  return false;
}

/** IDs `/photo/` dans le HTML public + détection du mur login/captcha. */
export function extraireIdsPhotoHtml(
  html: string,
  handle: string,
): { ids: string[]; murLogin: boolean } {
  const h = handle.replace(/^@/, "");
  const decoded = html.replace(/\\u002[fF]/g, "/");
  const ids = new Set<string>();
  const motif = new RegExp(`/@${h}/photo/(\\d+)`, "gi");
  for (const m of decoded.matchAll(motif)) ids.add(m[1]);
  const aUnPost = /@[\w.]+\/(?:photo|video)\/\d+/.test(decoded);
  const murLogin =
    ids.size === 0 &&
    !aUnPost &&
    /captcha|__UNIVERSAL_DATA_FOR_REHYDRATION__/i.test(html);
  return { ids: [...ids], murLogin };
}
