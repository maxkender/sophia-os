import {
  echantillonClesItems,
  extraireErrorCodesApify,
  extraireMetaProfilHtml,
  extraireUrlsEmbedHtml,
  extraireUrlsPostsHtml,
} from "./tiktok_listing.ts";

const ACTOR = "clockworks~tiktok-scraper";
const ACTOR_PROFIL = "clockworks~tiktok-profile-scraper";

export interface ScrapedPost {
  postId: string;
  webVideoUrl: string;
  text: string;
  imageUrls: string[];
  musicUrl: string | null;
  musicTitle: string | null;
  createTime: number | null;
  /** Flag acteur Clockworks — les slideshows sont souvent en /video/. */
  isSlideshow: boolean;
  stats: { vues: number; likes: number; commentaires: number; partages: number };
}

/** Diaporama = photos, pas une vraie vidéo. */
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

/** Post vidéo TikTok (download Apify activé → mediaUrls KV). */
export interface ScrapedVideo {
  postId: string;
  webVideoUrl: string;
  text: string;
  videoUrl: string;
  coverUrl: string | null;
  musicUrl: string | null;
  musicTitle: string | null;
  createTime: number | null;
  dureeMs: number | null;
  largeur: number | null;
  hauteur: number | null;
  stats: { vues: number; likes: number; commentaires: number; partages: number };
}

interface MusicMeta {
  playUrl?: string;
  musicId?: string;
  musicName?: string;
  musicAuthor?: string;
}

interface ApifyItem {
  id?: string;
  errorCode?: string;
  error?: string;
  webVideoUrl?: string;
  text?: string;
  authorMeta?: {
    signature?: string;
    nickName?: string;
    name?: string;
    avatar?: string;
    avatarLarger?: string;
    avatarMedium?: string;
    avatarThumb?: string;
    originalAvatarUrl?: string;
  };
  createTimeISO?: string;
  createTime?: number;
  imageUrlList?: string[];
  slideshowImageLinks?: Array<string | { downloadLink?: string; url?: string }>;
  /** Rempli quand shouldDownloadVideos / covers — URLs KV Apify. */
  mediaUrls?: string[];
  videoMeta?: {
    downloadAddr?: string;
    coverUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
  };
  covers?: string[];
  isSlideshow?: boolean;
  musicMeta?: MusicMeta;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
}

/**
 * Lien vers la PAGE « son » de TikTok — stable et partageable, contrairement au
 * `playUrl` (fichier audio CDN signé qui expire au bout de quelques jours, d'où
 * les boutons musique morts). C'est cette page qui laisse le poster ajouter le
 * son en favori et « utiliser ce son ». Le slug avant l'ID n'est que cosmétique :
 * TikTok redirige d'après l'identifiant numérique final. Ne révèle pas le compte
 * source (elle liste toutes les vidéos qui utilisent ce son).
 */
function lienMusique(meta: MusicMeta | undefined): { url: string | null; titre: string | null } {
  const titre = meta?.musicName?.trim() || null;
  if (meta?.musicId) {
    const slug =
      (titre ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "son";
    return { url: `https://www.tiktok.com/music/${slug}-${meta.musicId}`, titre };
  }
  // Pas d'ID exploitable : on retombe sur le playUrl, faute de mieux.
  return { url: meta?.playUrl ?? null, titre };
}

function normaliseImageLink(link: string | { downloadLink?: string; url?: string }) {
  if (typeof link === "string") return link;
  return link.downloadLink ?? link.url ?? null;
}

/**
 * Le scraper renvoie les visuels dans deux champs qui se tronquent
 * mutuellement selon les posts : on fusionne et on dédoublonne plutôt que de
 * faire confiance à l'un des deux.
 */
function mergeImageUrls(item: ApifyItem): string[] {
  const fromList = item.imageUrlList ?? [];
  const fromSlideshow = (item.slideshowImageLinks ?? [])
    .map(normaliseImageLink)
    .filter((url): url is string => Boolean(url));

  return [...new Set([...fromList, ...fromSlideshow])];
}

/**
 * Les médias rapatriés par le scraper vivent dans le key-value store d'Apify,
 * qui répond 403 sans token et purge ses données après quelques jours. On les
 * télécharge donc pour les stocker chez nous.
 */
export async function downloadMedia(url: string): Promise<Uint8Array> {
  const token = Deno.env.get("APIFY_TOKEN");
  const isApifyStore = url.startsWith("https://api.apify.com/");
  const target = isApifyStore && token ? `${url}?token=${token}` : url;

  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(`Téléchargement média ${response.status} (${url.slice(0, 80)})`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/** Alias historique — images slideshow. */
export async function downloadImage(url: string): Promise<Uint8Array> {
  return downloadMedia(url);
}

function pickVideoUrl(item: ApifyItem): string | null {
  const media = item.mediaUrls ?? [];
  const mp4 = media.find((u) => /\.mp4(\?|$)/i.test(u));
  if (mp4) return mp4;
  const anyMedia = media.find((u) => typeof u === "string" && u.length > 0);
  if (anyMedia) return anyMedia;
  return item.videoMeta?.downloadAddr?.trim() || null;
}

function pickCoverUrl(item: ApifyItem): string | null {
  if (item.videoMeta?.coverUrl) return item.videoMeta.coverUrl;
  const fromCovers = (item.covers ?? []).find((u) => typeof u === "string" && u.length > 0);
  if (fromCovers) return fromCovers;
  const fromMedia = (item.mediaUrls ?? []).find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u));
  return fromMedia ?? null;
}

function corpsActeur(input: Record<string, unknown>): string {
  return JSON.stringify({
    shouldDownloadSlideshowImages: true,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    proxyCountryCode: "None",
    ...input,
  });
}

function postsDepuisItems(
  items: ApifyItem[],
  photosSeulement: boolean,
): ScrapedPost[] {
  return items
    .map((item) => {
      const imageUrls = mergeImageUrls(item);
      const coverUrls = [
        item.videoMeta?.coverUrl ?? "",
        ...(item.covers ?? []),
      ].filter(Boolean);
      const webVideoUrl = item.webVideoUrl ?? "";
      const postId =
        item.id
        || webVideoUrl.match(/\/(?:photo|video)\/(\d+)/)?.[1]
        || "";
      return {
        postId,
        webVideoUrl,
        text: item.text ?? "",
        imageUrls,
        musicUrl: lienMusique(item.musicMeta).url,
        musicTitle: lienMusique(item.musicMeta).titre,
        createTime: item.createTime ?? null,
        isSlideshow: estPostDiaporama({
          webVideoUrl: item.webVideoUrl,
          imageUrls,
          isSlideshow: item.isSlideshow,
          coverUrls,
        }),
        stats: {
          vues: item.playCount ?? 0,
          likes: item.diggCount ?? 0,
          commentaires: item.commentCount ?? 0,
          partages: item.shareCount ?? 0,
        },
      };
    })
    .filter((post) => (post.postId || post.webVideoUrl) && (!photosSeulement || post.isSlideshow));
}

function postsEtErreurs(items: unknown[], photosSeulement: boolean): {
  posts: ScrapedPost[];
  brut: number;
  errorCodes: string[];
  echantillon: string;
} {
  return {
    posts: postsDepuisItems(items as ApifyItem[], photosSeulement),
    brut: items.length,
    errorCodes: extraireErrorCodesApify(items),
    echantillon: echantillonClesItems(items),
  };
}

async function runActor(
  input: Record<string, unknown>,
  // Le pipeline ne veut que des posts photo ; la collecte de métriques, elle,
  // doit voir tout ce que le compte a publié.
  photosSeulement = true,
  timeoutMs = 90_000,
): Promise<ScrapedPost[]> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN manquant");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: corpsActeur(input),
      },
    );
  } catch (e) {
    const nom = e instanceof Error ? e.name : "";
    if (nom === "AbortError") {
      throw new Error(`Apify timeout ${timeoutMs}ms (run-sync)`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Apify ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Apify réponse inattendue: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }
  return postsDepuisItems(parsed as ApifyItem[], photosSeulement);
}

async function lireDatasetItems(
  token: string,
  datasetId: string,
): Promise<unknown[]> {
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`,
  );
  if (!itemsRes.ok) {
    throw new Error(
      `Apify dataset ${itemsRes.status}: ${(await itemsRes.text()).slice(0, 300)}`,
    );
  }
  const parsed = (await itemsRes.json()) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Apify dataset inattendu: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }
  return parsed;
}

/** Start + poll : le listing worker a 8 min de lease, run-sync cale à 90s. */
async function runActorAsync(
  input: Record<string, unknown>,
  photosSeulement: boolean,
  timeoutMs: number,
  journal?: (msg: string) => void,
  actor = ACTOR,
): Promise<ScrapedPost[]> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN manquant");

  const start = await fetch(
    `https://api.apify.com/v2/acts/${actor}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpsActeur(input),
    },
  );
  if (!start.ok) {
    throw new Error(`Apify start ${start.status}: ${(await start.text()).slice(0, 300)}`);
  }
  const started = (await start.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  const runId = started.data?.id;
  const datasetId = started.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    throw new Error(`Apify start sans run/dataset: ${JSON.stringify(started).slice(0, 200)}`);
  }
  journal?.(
    `Apify ${actor.split("~")[1] ?? actor} run ${runId.slice(0, 8)}… status=${started.data?.status ?? "?"}`,
  );

  const t0 = Date.now();
  let status = started.data?.status ?? "RUNNING";
  while (Date.now() - t0 < timeoutMs) {
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${status} (${Date.now() - t0}ms)`);
    }
    await new Promise((r) => setTimeout(r, 4000));
    const st = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
    );
    if (!st.ok) {
      throw new Error(`Apify poll ${st.status}: ${(await st.text()).slice(0, 200)}`);
    }
    const body = (await st.json()) as { data?: { status?: string } };
    status = body.data?.status ?? status;
    journal?.(`Apify run ${status} (+${Date.now() - t0}ms)`);
  }
  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ${status} après ${timeoutMs}ms`);
  }

  let parsed = await lireDatasetItems(token, datasetId);
  // SUCCEEDED peut précéder l'écriture du dataset de quelques secondes.
  if (parsed.length === 0) {
    await new Promise((r) => setTimeout(r, 2500));
    parsed = await lireDatasetItems(token, datasetId);
  }
  const lu = postsEtErreurs(parsed, photosSeulement);
  journal?.(
    `Apify dataset: ${lu.brut} brut · ${lu.posts.length} posts · clés=${lu.echantillon}`
      + (lu.errorCodes.length ? ` · erreur=${lu.errorCodes.join(",")}` : ""),
  );
  return lu.posts;
}

export function scrapeProfile(handle: string, resultsPerPage: number) {
  return runActor({ profiles: [handle], resultsPerPage });
}

/**
 * Liste les posts d'un profil SANS télécharger les images slideshow.
 * Sert à découvrir les URLs ; chaque diaporama est ensuite scrapé via scrapePost
 * (1 agent Apify / slideshow).
 */
export async function listerPostsProfil(
  handle: string,
  resultsPerPage: number,
  journal?: (msg: string) => void,
  opts?: { actor?: string; proxyCountryCode?: string },
): Promise<ScrapedPost[]> {
  const h = handle.replace(/^@/, "");
  const t0 = Date.now();
  const actor = opts?.actor ?? ACTOR;
  journal?.(
    `Apify async profil="${h}" actor=${actor.split("~")[1] ?? actor} (max ${resultsPerPage}, timeout 4 min)…`,
  );
  const posts = await runActorAsync(
    {
      profiles: [h],
      resultsPerPage,
      shouldDownloadSlideshowImages: false,
      profileSorting: "latest",
      profileScrapeSections: ["videos"],
      ...(opts?.proxyCountryCode ? { proxyCountryCode: opts.proxyCountryCode } : {}),
    },
    false,
    240_000,
    journal,
    actor,
  );
  journal?.(
    `Apify profil="${h}": ${posts.length} items · ${posts.filter((p) => p.isSlideshow).length} diaporamas · ${Date.now() - t0}ms`,
  );
  return posts;
}

export { ACTOR_PROFIL as APIFY_ACTOR_PROFIL };

/** La bio (signature) et le nom affiché d'un profil TikTok, via Apify. Sert
 *  d'inspiration pour générer l'identité d'un poster. Renvoie null en cas d'échec. */
export async function scrapeProfileBio(
  handle: string,
): Promise<{ bio: string; nickname: string } | null> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return null;
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profiles: [handle], resultsPerPage: 1, shouldDownloadVideos: false }),
      },
    );
    if (!response.ok) return null;
    const items = (await response.json()) as ApifyItem[];
    const meta = items.find((i) => i.authorMeta)?.authorMeta;
    if (!meta) return null;
    return { bio: (meta.signature ?? "").trim(), nickname: (meta.nickName ?? meta.name ?? "").trim() };
  } catch {
    return null;
  }
}

/** Normalise handle TikTok depuis `@user` ou URL profil. */
export function normaliserHandleTiktok(brut: string): string | null {
  const s = brut.trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const m = u.pathname.match(/\/@([^/?#]+)/);
      if (m?.[1]) return m[1].replace(/^@/, "").trim();
    }
  } catch {
    // ignore
  }
  return s.replace(/^@/, "").split(/[/?#]/)[0]?.trim() || null;
}

function pickAvatarFromMeta(
  meta: ApifyItem["authorMeta"] | undefined,
): string | null {
  if (!meta) return null;
  const url =
    meta.avatarLarger ||
    meta.originalAvatarUrl ||
    meta.avatarMedium ||
    meta.avatar ||
    meta.avatarThumb ||
    null;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

/** Avatar depuis la page publique TikTok (filet si Apify n’expose pas le champ). */
async function avatarDepuisPageTiktok(handle: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.tiktok.com/@${handle}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const motifs = [
      /"avatarLarger"\s*:\s*"(https:[^"]+)"/,
      /"avatarMedium"\s*:\s*"(https:[^"]+)"/,
      /"avatarThumb"\s*:\s*"(https:[^"]+)"/,
      /property="og:image"\s+content="(https:[^"]+)"/,
      /content="(https:[^"]+)"\s+property="og:image"/,
    ];
    for (const re of motifs) {
      const m = html.match(re);
      if (m?.[1]) {
        return m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * URL de la photo de profil TikTok d’un handle.
 * Apify d’abord, puis scrape HTML de la page publique.
 */
export async function scrapeProfileAvatar(handleBrut: string): Promise<string | null> {
  const handle = normaliserHandleTiktok(handleBrut);
  if (!handle) return null;

  const token = Deno.env.get("APIFY_TOKEN");
  if (token) {
    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profiles: [handle],
            resultsPerPage: 1,
            shouldDownloadVideos: false,
          }),
        },
      );
      if (response.ok) {
        const items = (await response.json()) as ApifyItem[];
        const fromMeta = pickAvatarFromMeta(items.find((i) => i.authorMeta)?.authorMeta);
        if (fromMeta) return fromMeta;
      }
    } catch {
      // fallback HTML
    }
  }

  return await avatarDepuisPageTiktok(handle);
}

/**
 * Liste les diaporamas d'un compte en lisant sa page publique.
 *
 * Sert de filet quand l'acteur Apify cale sur un compte précis : il a renvoyé
 * des 500 à répétition sur l'un des nôtres alors que la page, elle, affichait
 * seize diaporamas. On récupère juste les identifiants ici, puis chaque post
 * est scrapé un par un — un post isolé passe là où le compte entier échoue.
 */
export type DiaporamasPage = {
  urls: string[];
  status: number;
  htmlOctets: number;
  ms: number;
  murLogin: boolean;
  videoCount?: number | null;
};

export async function listerDiaporamasDetail(handle: string): Promise<DiaporamasPage> {
  const t0 = Date.now();
  const response = await fetch(`https://www.tiktok.com/@${handle}`, {
    headers: {
      // Sans en-tête de navigateur, TikTok sert une page vide aux robots.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });
  const html = await response.text();
  const ms = Date.now() - t0;
  if (!response.ok) {
    throw new Error(
      `Page TikTok ${response.status} pour @${handle} (${html.length} octets, ${ms}ms)`,
    );
  }

  const urls = extraireUrlsPostsHtml(html, handle);
  const meta = extraireMetaProfilHtml(html);
  const aUnPost = urls.length > 0 || /@[\w.]+\/(?:photo|video)\/\d+/.test(html);
  const murLogin =
    urls.length === 0 &&
    !aUnPost &&
    /captcha|__UNIVERSAL_DATA_FOR_REHYDRATION__/i.test(html);

  return {
    urls,
    status: response.status,
    htmlOctets: html.length,
    ms,
    murLogin,
    videoCount: meta.videoCount,
  };
}

const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Grille embed : passe souvent le mur login de la page profil. */
export async function listerDepuisEmbed(handle: string): Promise<{
  urls: string[];
  status: number;
  htmlOctets: number;
  ms: number;
}> {
  const h = handle.replace(/^@/, "");
  const t0 = Date.now();
  const response = await fetch(`https://www.tiktok.com/embed/@${h}`, {
    headers: {
      "user-agent": UA_MOBILE,
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });
  const html = await response.text();
  return {
    urls: extraireUrlsEmbedHtml(html, h),
    status: response.status,
    htmlOctets: html.length,
    ms: Date.now() - t0,
  };
}

export async function listerDiaporamas(handle: string): Promise<string[]> {
  return (await listerDiaporamasDetail(handle)).urls;
}

/**
 * Relève les performances d'un compte : tous les posts, photo ou non.
 * Pas de download d'images — on n'a besoin que des compteurs (vues/likes).
 * (Avant : download slideshow → Apify trop lent → timeout Edge 150s sur le drain ELO.)
 */
export function scrapeStats(handle: string, resultsPerPage: number) {
  return runActor(
    {
      profiles: [handle],
      resultsPerPage,
      shouldDownloadSlideshowImages: false,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    false,
  );
}

/** Scrape un seul post par son URL, pour tester le pipeline sur un TikTok précis. */
export function scrapePost(url: string) {
  return runActor({ postURLs: [url], resultsPerPage: 1 });
}

/**
 * Scrape une vidéo TikTok et télécharge le fichier (add-on Apify).
 * Renvoie l’URL KV / CDN du MP4 — à rapatrier via `downloadMedia` avant expiration.
 */
export async function scrapeVideoPost(url: string): Promise<ScrapedVideo> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN manquant");

  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postURLs: [url],
        resultsPerPage: 1,
        shouldDownloadVideos: true,
        shouldDownloadSlideshowImages: false,
        shouldDownloadCovers: true,
        proxyCountryCode: "None",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Apify video ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const items = (await response.json()) as ApifyItem[];
  const item = items[0];
  if (!item?.id) throw new Error("Apify: aucune vidéo renvoyée pour ce lien");

  const videoUrl = pickVideoUrl(item);
  if (!videoUrl) {
    throw new Error(
      "Apify: pas de fichier vidéo (mediaUrls vide). Vérifie que le lien est une vidéo TikTok.",
    );
  }

  const musique = lienMusique(item.musicMeta);
  const dureeSec = item.videoMeta?.duration;
  return {
    postId: item.id,
    webVideoUrl: item.webVideoUrl ?? url,
    text: item.text ?? "",
    videoUrl,
    coverUrl: pickCoverUrl(item),
    musicUrl: musique.url,
    musicTitle: musique.titre,
    createTime: item.createTime ?? null,
    dureeMs: typeof dureeSec === "number" ? Math.round(dureeSec * 1000) : null,
    largeur: item.videoMeta?.width ?? null,
    hauteur: item.videoMeta?.height ?? null,
    stats: {
      vues: item.playCount ?? 0,
      likes: item.diggCount ?? 0,
      commentaires: item.commentCount ?? 0,
      partages: item.shareCount ?? 0,
    },
  };
}
