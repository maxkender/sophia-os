/**
 * Banque d'exemples natifs (0423) : des slideshows de vrais créateurs de chaque
 * langue, tous labels confondus, que la traduction ancrée lit en entier. Ici
 * la logique pure : ce que l'admin a collé, et le texte d'un exemple.
 */

/** Une vingtaine d'exemples par langue suffit à couvrir nos labels. */
export const OBJECTIF_EXEMPLES = 20;
/**
 * Pour chaque compte collé : ses 5 slideshows les plus récents (le ton
 * d'aujourd'hui) et ses 5 plus likés (ce qui a plu à son public), pris parmi
 * ses 60 derniers posts. Au-delà, les « plus likés » remontent à des posts
 * vieux de plusieurs années, à l'argot daté.
 */
export const SLIDESHOWS_RECENTS = 5;
export const SLIDESHOWS_PLUS_LIKES = 5;
export const POSTS_LUS_PAR_COMPTE = 60;
/**
 * Le travail tourne sur le serveur (0618) : l'admin colle et peut fermer la
 * page ; la tâche planifiée passe chaque minute. Une fonction Edge s'arrête à
 * 150 s, d'où des passages courts : quelques comptes (une recherche Apify de
 * 20 à 40 s chacun, en parallèle) et quelques slideshows (un seul run Apify
 * pour tous, puis l'OCR de leurs slides).
 */
export const COMPTES_PAR_PASSAGE = 4;
export const LECTURES_PAR_PASSAGE = 6;
/** Slides lues en même temps par l'OCR. */
export const OCR_EN_PARALLELE = 8;
/**
 * Passé ce délai, un passage ne lance plus d'OCR (une slide prend quelques
 * secondes) : le slideshow inachevé retourne en file.
 */
export const BUDGET_PASSAGE_MS = 115_000;
/** Un compte ou un slideshow pris trois fois sans aboutir est abandonné (0618). */
export const TENTATIVES_MAX = 3;
/** Lignes acceptées par envoi : au-delà, coller en plusieurs fois. */
export const MAX_LIGNES_PAR_ENVOI = 200;
/** En dessous, l'exemple n'apprend rien : c'est une image, pas un slideshow. */
export const SLIDES_TEXTE_MIN = 3;

export interface LignesCollees {
  /** Liens de posts TikTok (`/photo/` ou `/video/`), dédoublonnés. */
  posts: string[];
  /** Comptes (`@pseudo` ou lien de profil), sans le @. */
  comptes: string[];
  /** Lignes qu'on ne sait pas lire. */
  ignorees: string[];
}

const POST = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([\w.-]+)\/(photo|video)\/(\d+)/i;
const PROFIL = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([\w.-]+)\/?(?:[?#].*)?$/i;
const PSEUDO = /^@?([\w.-]{2,})$/;

/** Ce que l'admin a collé, une ligne par lien ou par compte. */
export function lireLignes(texte: string): LignesCollees {
  const posts: string[] = [];
  const comptes: string[] = [];
  const ignorees: string[] = [];
  for (const brute of texte.split(/[\n,;]+/)) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const post = ligne.match(POST);
    if (post) {
      const url = `https://www.tiktok.com/@${post[1]}/${post[2].toLowerCase()}/${post[3]}`;
      if (!posts.includes(url)) posts.push(url);
      continue;
    }
    const profil = ligne.match(PROFIL) ?? (ligne.includes("/") ? null : ligne.match(PSEUDO));
    if (profil) {
      const pseudo = profil[1].toLowerCase();
      if (!comptes.includes(pseudo)) comptes.push(pseudo);
      continue;
    }
    ignorees.push(ligne);
  }
  return { posts, comptes, ignorees };
}

/** Le pseudo d'un lien de post (`@pseudo`), ou null. */
export function pseudoDuLien(url: string): string | null {
  return url.match(POST)?.[1]?.toLowerCase() ?? null;
}

/** L'identifiant TikTok d'un lien de post, `/photo/` ou `/video/`. */
export function idPost(url: string): string | null {
  return url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? null;
}

/**
 * Le post d'Apify qui correspond à un lien de la banque. Comparer sur l'ID :
 * Apify renvoie `/video/` même pour un slideshow collé en `/photo/`.
 */
export function postDuLien<P extends { postId: string; webVideoUrl: string }>(
  url: string,
  posts: ReadonlyArray<P>,
): P | null {
  const id = idPost(url);
  if (!id) return null;
  return posts.find((p) => p.postId === id || idPost(p.webVideoUrl) === id) ?? null;
}

/**
 * Après un essai raté : la ligne retourne en file pour le passage suivant, ou
 * est abandonnée si c'était son dernier essai.
 */
export function apresEchec(tentatives: number, motif: string): { statut: "en_attente" | "erreur"; erreur: string } {
  return { statut: tentatives >= TENTATIVES_MAX ? "erreur" : "en_attente", erreur: motif };
}

export interface PostListe {
  webVideoUrl: string;
  createTime: number | null;
  imageUrls?: string[];
  stats?: { likes?: number };
}

/**
 * Les slideshows d'un compte à lire : les plus récents, puis les plus likés
 * parmi les autres.
 *
 * Apify renvoie `webVideoUrl` en `/video/` même pour un slideshow, et sans
 * téléchargement ses images peuvent manquer. Un post est donc un slideshow
 * s'il a un lien `/photo/`, des images, ou si la page publique du compte le
 * liste en `/photo/` (`idsPhoto`) : la même règle que l'import des comptes de
 * référence. Si rien n'est reconnu, on prend quand même les posts candidats
 * (`verifies: false`) : la lecture écarte ensuite les vidéos, une par une.
 */
export function slideshowsDuCompte(
  posts: ReadonlyArray<PostListe>,
  idsPhoto: ReadonlySet<string> = new Set(),
  recents = SLIDESHOWS_RECENTS,
  plusLikes = SLIDESHOWS_PLUS_LIKES,
): { urls: string[]; verifies: boolean } {
  const estSlideshow = (p: PostListe) =>
    /\/photo\/\d+/.test(p.webVideoUrl) ||
    (p.imageUrls?.length ?? 0) > 0 ||
    idsPhoto.has(idPost(p.webVideoUrl) ?? "");
  const reconnus = posts.filter(estSlideshow);
  const verifies = reconnus.length > 0;
  const candidats = verifies ? reconnus : posts;
  const parDate = [...candidats].sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
  const choisis = parDate.slice(0, recents).map((p) => p.webVideoUrl);
  const parLikes = parDate
    .filter((p) => !choisis.includes(p.webVideoUrl))
    .sort((a, b) => (b.stats?.likes ?? 0) - (a.stats?.likes ?? 0));
  return { urls: [...choisis, ...parLikes.slice(0, plusLikes).map((p) => p.webVideoUrl)], verifies };
}

export interface SlideExemple {
  position: number;
  texte: string;
}

/** Les slides lues par OCR, dans l'ordre, sans les slides vides. */
export function slidesLues(textes: ReadonlyArray<string>): SlideExemple[] {
  return textes
    .map((texte, i) => ({ position: i + 1, texte: texte.replace(/[ \t]*\n[ \t]*/g, "\n").trim() }))
    .filter((s) => s.texte);
}

/** Pourquoi un slideshow lu ne peut pas servir d'exemple, ou null s'il peut. */
export function motifRefus(nbImages: number, slides: ReadonlyArray<SlideExemple>): string | null {
  if (nbImages === 0) return "Pas un slideshow (aucune image) : c'est sans doute une vidéo.";
  if (slides.length < SLIDES_TEXTE_MIN) {
    return `Seulement ${slides.length} slide(s) avec du texte sur ${nbImages} : il en faut au moins ${SLIDES_TEXTE_MIN}.`;
  }
  return null;
}

/** Le texte d'un exemple tel que l'agent le lit : une slide par ligne. */
export function texteExemple(slides: unknown): string {
  const liste = (Array.isArray(slides) ? slides : []) as Array<Partial<SlideExemple>>;
  return liste
    .filter((s) => (s.texte ?? "").trim())
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((s) => (s.texte ?? "").trim())
    .join("\n");
}
