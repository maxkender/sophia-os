/** Listing profil Clockworks : tout le compte, pas une grille embed. */
export const APIFY_LISTING_ACTOR = "clockworks~tiktok-profile-scraper";
export const APIFY_LISTING_FALLBACK_ACTOR = "clockworks~tiktok-scraper";
export const APIFY_LISTING_MAX = 200;

/** Input Clockworks pour un profil entier. Pas de filtre date (sinon FILTER_NO_PASS). */
export function inputListingProfil(
  handle: string,
  resultsPerPage = APIFY_LISTING_MAX,
): Record<string, unknown> {
  return {
    profiles: [handle.replace(/^@/, "")],
    resultsPerPage,
    profileSorting: "latest",
    profileScrapeSections: ["videos"],
    excludePinnedPosts: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadAvatars: false,
  };
}

/** IDs de posts TikTok dans le HTML (page profil). */

const ID_RE = "(\\d{10,})";

export function extraireUrlsPostsHtml(html: string, handle: string): string[] {
  const h = handle.replace(/^@/, "");
  const decoded = html.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/");
  const urls = new Set<string>();
  const motif = new RegExp(`/@${escapeRe(h)}/(photo|video)/${ID_RE}`, "gi");
  for (const m of decoded.matchAll(motif)) {
    urls.add(`https://www.tiktok.com/@${h}/${m[1]}/${m[2]}`);
  }
  return [...urls];
}

/** Embed TikTok : grille publique, souvent sans mur login. */
export function extraireUrlsEmbedHtml(html: string, handle: string): string[] {
  const h = handle.replace(/^@/, "");
  const decoded = html.replace(/&amp;/g, "&");
  const depuisHandle = extraireUrlsPostsHtml(decoded, h);
  if (depuisHandle.length > 0) return depuisHandle;
  // Filet : /video|/photo/ même si le handle est encodé autrement.
  const urls = new Set<string>();
  const motif = new RegExp(`tiktok\\.com/@${escapeRe(h)}/(photo|video)/${ID_RE}`, "gi");
  for (const m of decoded.matchAll(motif)) {
    urls.add(`https://www.tiktok.com/@${h}/${m[1]}/${m[2]}`);
  }
  return [...urls];
}

export function extraireMetaProfilHtml(html: string): {
  videoCount: number | null;
  userId: string | null;
  uniqueId: string | null;
} {
  const videoCount = extraireNombre(html, /"videoCount"\s*:\s*(\d+)/);
  const userId = html.match(/"webapp\.user-detail"[\s\S]{0,800}"id"\s*:\s*"(\d{8,})"/)?.[1]
    ?? html.match(/"uniqueId"\s*:\s*"[^"]+"[\s\S]{0,200}"id"\s*:\s*"(\d{8,})"/)?.[1]
    ?? null;
  const uniqueId = html.match(/"uniqueId"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  return { videoCount, userId, uniqueId };
}

export function extraireErrorCodesApify(items: unknown[]): string[] {
  const codes = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    for (const cle of ["errorCode", "error", "noResultsReason"]) {
      const v = rec[cle];
      if (typeof v === "string" && v.trim()) codes.add(v.trim());
    }
  }
  return [...codes];
}

export function echantillonClesItems(items: unknown[]): string {
  const premier = items.find((i) => i && typeof i === "object") as
    | Record<string, unknown>
    | undefined;
  if (!premier) return "dataset vide";
  return Object.keys(premier).slice(0, 12).join(",");
}

function extraireNombre(html: string, re: RegExp): number | null {
  const m = html.match(re);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
