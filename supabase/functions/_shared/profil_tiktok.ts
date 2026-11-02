/**
 * Le profil TikTok PUBLIC d'un compte, lu sur sa page (`tiktok.com/@handle`),
 * sans Apify : pour le warm-up de Check, Kill or Double (0356), on veut savoir
 * si le compte existe, quand il a été créé, combien il suit de comptes et
 * combien de vidéos il a aimées. Les reposts ne sont pas visibles de
 * l'extérieur.
 *
 * La page porte ses données dans un JSON (`__UNIVERSAL_DATA_FOR_REHYDRATION__`),
 * sous `webapp.user-detail` : `statusCode` 0 = le compte existe, 10221 = il
 * n'existe pas. Une page sans ce JSON (TikTok a bloqué, captcha) ne dit rien :
 * `existe` reste null, jamais « n'existe pas ».
 */

export interface ProfilTiktok {
  /** null : page illisible, on ne sait pas. */
  existe: boolean | null;
  /** Création du compte TikTok (ISO), quand il existe. */
  creeLe: string | null;
  abonnements: number | null;
  /** Vidéos aimées par le compte (`diggCount`). */
  likes: number | null;
  abonnes: number | null;
  videos: number | null;
  erreur: string | null;
}

/** Ce qu'on lit de `webapp.user-detail` (le reste est ignoré). */
interface DetailUtilisateur {
  statusCode?: unknown;
  userInfo?: {
    user?: { createTime?: unknown };
    stats?: Record<string, unknown>;
    statsV2?: Record<string, unknown>;
  };
}

/** Les codes de `webapp.user-detail` qui veulent dire « ce compte n'existe pas ». */
const INTROUVABLE = new Set([10221, 10202]);

const ILLISIBLE = (erreur: string): ProfilTiktok => ({
  existe: null,
  creeLe: null,
  abonnements: null,
  likes: null,
  abonnes: null,
  videos: null,
  erreur,
});

function entier(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

/** Lit le profil dans le HTML de la page. Ne lève jamais. */
export function profilDepuisHtml(html: string): ProfilTiktok {
  const m = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return ILLISIBLE("page sans données (blocage TikTok ?)");
  let donnees: unknown;
  try {
    donnees = JSON.parse(m[1]!);
  } catch {
    return ILLISIBLE("données illisibles");
  }
  const detail = (donnees as { __DEFAULT_SCOPE__?: Record<string, DetailUtilisateur | undefined> } | null)
    ?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
  if (!detail || typeof detail !== "object") return ILLISIBLE("page sans profil");
  const code = entier(detail.statusCode);
  if (code !== null && INTROUVABLE.has(code)) {
    return { existe: false, creeLe: null, abonnements: null, likes: null, abonnes: null, videos: null, erreur: null };
  }
  const user = detail.userInfo?.user;
  const stats = detail.userInfo?.stats ?? detail.userInfo?.statsV2;
  if (code !== 0 || !user || !stats) return ILLISIBLE(`statut TikTok ${code ?? "inconnu"}`);
  const creation = entier(user.createTime);
  return {
    existe: true,
    creeLe: creation ? new Date(creation * 1000).toISOString() : null,
    abonnements: entier(stats.followingCount),
    likes: entier(stats.diggCount),
    abonnes: entier(stats.followerCount),
    videos: entier(stats.videoCount),
    erreur: null,
  };
}

/** Va lire la page publique du compte. Ne lève jamais : une erreur donne `existe` null. */
export async function lireProfilTiktok(handle: string, delaiMs = 20_000): Promise<ProfilTiktok> {
  const propre = handle.trim().replace(/^@+/, "");
  if (!propre) return ILLISIBLE("handle vide");
  try {
    const reponse = await fetch(`https://www.tiktok.com/@${encodeURIComponent(propre)}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(delaiMs),
    });
    if (!reponse.ok) return ILLISIBLE(`HTTP ${reponse.status}`);
    return profilDepuisHtml(await reponse.text());
  } catch (e) {
    return ILLISIBLE(e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200));
  }
}

/**
 * Prompt 25 MAJ, point 7b : une page illisible (TikTok bloque, délai) ne veut
 * jamais dire « introuvable » : la lecture est refaite une 2e fois, 2 s plus
 * tard, avant de conclure. `lire` est remplaçable (tests).
 */
export async function lireProfilTiktokFiable(
  handle: string,
  lire: (h: string) => Promise<ProfilTiktok> = lireProfilTiktok,
  attente = 2000,
): Promise<ProfilTiktok> {
  const premier = await lire(handle);
  if (premier.existe !== null) return premier;
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  const second = await lire(handle);
  return second.existe !== null ? second : { ...second, erreur: `2 lectures illisibles : ${second.erreur ?? premier.erreur ?? "?"}` };
}
