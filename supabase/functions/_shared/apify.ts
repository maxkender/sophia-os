const ACTOR = "clockworks~tiktok-scraper";

export interface ScrapedPost {
  postId: string;
  webVideoUrl: string;
  text: string;
  imageUrls: string[];
  musicUrl: string | null;
  musicTitle: string | null;
  createTime: number | null;
  stats: { vues: number; likes: number; commentaires: number; partages: number };
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
  webVideoUrl?: string;
  text?: string;
  authorMeta?: { signature?: string; nickName?: string; name?: string };
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

async function runActor(
  input: Record<string, unknown>,
  // Le pipeline ne veut que des posts photo ; la collecte de métriques, elle,
  // doit voir tout ce que le compte a publié.
  photosSeulement = true,
): Promise<ScrapedPost[]> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN manquant");

  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shouldDownloadSlideshowImages: true,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        proxyCountryCode: "None",
        ...input,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Apify ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const items = (await response.json()) as ApifyItem[];

  return items
    .map((item) => ({
      postId: item.id ?? "",
      webVideoUrl: item.webVideoUrl ?? "",
      text: item.text ?? "",
      imageUrls: mergeImageUrls(item),
      musicUrl: lienMusique(item.musicMeta).url,
      musicTitle: lienMusique(item.musicMeta).titre,
      createTime: item.createTime ?? null,
      stats: {
        vues: item.playCount ?? 0,
        likes: item.diggCount ?? 0,
        commentaires: item.commentCount ?? 0,
        partages: item.shareCount ?? 0,
      },
    }))
    .filter((post) => post.postId && (!photosSeulement || post.imageUrls.length > 0));
}

export function scrapeProfile(handle: string, resultsPerPage: number) {
  return runActor({ profiles: [handle], resultsPerPage });
}

/**
 * Liste les posts d'un profil SANS télécharger les images slideshow.
 * Sert à découvrir les URLs ; chaque diaporama est ensuite scrapé via scrapePost
 * (1 agent Apify / slideshow).
 */
export function listerPostsProfil(handle: string, resultsPerPage: number) {
  return runActor(
    {
      profiles: [handle],
      resultsPerPage,
      shouldDownloadSlideshowImages: false,
    },
    // Sans download, imageUrls peut être vide même pour un photo-post :
    // on garde tout et on filtre /photo/ côté appelant.
    false,
  );
}

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

/**
 * Liste les diaporamas d'un compte en lisant sa page publique.
 *
 * Sert de filet quand l'acteur Apify cale sur un compte précis : il a renvoyé
 * des 500 à répétition sur l'un des nôtres alors que la page, elle, affichait
 * seize diaporamas. On récupère juste les identifiants ici, puis chaque post
 * est scrapé un par un — un post isolé passe là où le compte entier échoue.
 */
export async function listerDiaporamas(handle: string): Promise<string[]> {
  const response = await fetch(`https://www.tiktok.com/@${handle}`, {
    headers: {
      // Sans en-tête de navigateur, TikTok sert une page vide aux robots.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`Page TikTok ${response.status} pour @${handle}`);

  const html = await response.text();
  const motif = new RegExp(`/@${handle}/photo/(\\d+)`, "g");
  const ids = new Set<string>();
  for (const trouve of html.matchAll(motif)) ids.add(trouve[1]);

  return [...ids].map((id) => `https://www.tiktok.com/@${handle}/photo/${id}`);
}

/** Relève les performances d'un compte : tous les posts, photo ou non. */
export function scrapeStats(handle: string, resultsPerPage: number) {
  return runActor({ profiles: [handle], resultsPerPage }, false);
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
