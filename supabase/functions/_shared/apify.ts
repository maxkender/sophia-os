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
  /**
   * Le profil de l'auteur au moment du scrape, répété sur chaque post : nombre
   * d'abonnés et lien cliquable du profil (Modifier le profil → Liens), pas
   * celui écrit dans la bio. Sert au contrôle « lien à 1 000 abonnés » (0323).
   */
  auteur: { abonnes: number | null; lienBio: string | null };
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
  /** Qualité TikTok déclarée par Apify (`videoMeta.definition`), ex. 540p / 720p. */
  definition: string | null;
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
  authorMeta?: {
    signature?: string;
    nickName?: string;
    name?: string;
    avatar?: string;
    avatarLarger?: string;
    avatarMedium?: string;
    avatarThumb?: string;
    originalAvatarUrl?: string;
    fans?: number;
    /** Chaîne, ou objet `{ link }` selon les versions de l'acteur. */
    bioLink?: unknown;
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
    /** Qualité TikTok déclarée (souvent « 540p » = stream play, pas un recodage chez nous). */
    definition?: string;
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

/**
 * Fichier vidéo à rapatrier. `mediaUrls` = octets déjà stockés par Apify
 * (add-on shouldDownloadVideos) — on ne recode pas. Fallback `downloadAddr`
 * TikTok si le KV est vide. Pas de transcode ici.
 * Seuils / ordre identiques à `src/features/ugc/pickTikTokVideoUrl.ts`.
 */
export function pickVideoUrl(item: ApifyItem): string | null {
  const media = (item.mediaUrls ?? []).filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );
  const mp4s = media.filter((u) => /\.mp4(\?|$)/i.test(u));
  if (mp4s.length > 0) return mp4s[mp4s.length - 1]!;
  if (media.length > 0) return media[media.length - 1]!;
  return item.videoMeta?.downloadAddr?.trim() || null;
}

function pickCoverUrl(item: ApifyItem): string | null {
  if (item.videoMeta?.coverUrl) return item.videoMeta.coverUrl;
  const fromCovers = (item.covers ?? []).find((u) => typeof u === "string" && u.length > 0);
  if (fromCovers) return fromCovers;
  const fromMedia = (item.mediaUrls ?? []).find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u));
  return fromMedia ?? null;
}

/** Le lien cliquable du profil, quelle que soit sa forme dans la réponse Apify. */
export function lienBioDe(bioLink: unknown): string | null {
  if (typeof bioLink === "string") return bioLink.trim() || null;
  if (bioLink && typeof bioLink === "object") {
    const o = bioLink as { link?: unknown; url?: unknown };
    const lien = typeof o.link === "string" ? o.link : typeof o.url === "string" ? o.url : "";
    return lien.trim() || null;
  }
  return null;
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
      auteur: {
        abonnes: typeof item.authorMeta?.fans === "number" ? item.authorMeta.fans : null,
        lienBio: lienBioDe(item.authorMeta?.bioLink),
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

/**
 * Stats de posts précis, en UN seul run : un résultat par lien, facturé au
 * résultat. Bien moins cher que `scrapeStats` (30 posts par compte) quand on
 * ne suit que les posts récents. `webVideoUrl` revient en /video/ même pour un
 * post photo : comparer sur l'ID numérique.
 */
export function scrapeStatsPosts(urls: string[]) {
  return runActor(
    {
      postURLs: urls,
      resultsPerPage: 1,
      shouldDownloadSlideshowImages: false,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    false,
  );
}

export interface CommentaireTiktok {
  cid: string;
  auteur: string;
  texte: string;
  likes: number;
  creeAt: string | null;
}

/** Commentaires de premier niveau d'un post (acteur dédié, facturé au commentaire). */
export async function scrapeCommentaires(url: string, max: number): Promise<CommentaireTiktok[]> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN manquant");

  const response = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-comments-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postURLs: [url], commentsPerPost: max, maxRepliesPerComment: 0 }),
    },
  );
  if (!response.ok) {
    throw new Error(`Apify commentaires ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const items = (await response.json()) as Array<{
    cid?: string;
    uniqueId?: string;
    text?: string;
    diggCount?: number;
    createTimeISO?: string;
  }>;
  return items
    .filter((c) => c.cid)
    .map((c) => ({
      cid: c.cid!,
      auteur: c.uniqueId ?? "",
      texte: c.text ?? "",
      likes: c.diggCount ?? 0,
      creeAt: c.createTimeISO ?? null,
    }));
}

/** Scrape un seul post par son URL, pour tester le pipeline sur un TikTok précis. */
export function scrapePost(url: string) {
  return runActor({ postURLs: [url], resultsPerPage: 1 });
}

/**
 * Plusieurs posts par leurs liens, en UN run, images des slideshows comprises.
 * Les vidéos reviennent aussi (sans images) : à l'appelant de les écarter.
 * `webVideoUrl` revient en /video/ même pour un post photo : comparer sur l'ID.
 */
export function scrapePosts(urls: string[]) {
  return runActor({ postURLs: urls, resultsPerPage: 1 }, false);
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
    definition: item.videoMeta?.definition?.trim() || null,
    stats: {
      vues: item.playCount ?? 0,
      likes: item.diggCount ?? 0,
      commentaires: item.commentCount ?? 0,
      partages: item.shareCount ?? 0,
    },
  };
}
