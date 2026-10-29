/**
 * Banque d'exemples natifs (0380) : des slideshows de vrais créateurs de chaque
 * langue, tous labels confondus, que la traduction ancrée lit en entier. Ici
 * la logique pure : ce que l'admin a collé, et le texte d'un exemple.
 */

/** Une vingtaine d'exemples par langue suffit à couvrir nos labels. */
export const OBJECTIF_EXEMPLES = 20;
/** Slideshows pris par compte collé (les plus récents). */
export const SLIDESHOWS_PAR_COMPTE = 5;
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

/**
 * Les slideshows d'un compte : les liens `/photo/`, les plus récents d'abord.
 * Un lien `/video/` peut être un slideshow, mais sans télécharger on ne le sait
 * pas : on le laisse, plutôt que de lire des vidéos.
 */
export function slideshowsDuCompte(
  posts: ReadonlyArray<{ webVideoUrl: string; createTime: number | null }>,
  n = SLIDESHOWS_PAR_COMPTE,
): string[] {
  return posts
    .filter((p) => /\/photo\/\d+/.test(p.webVideoUrl))
    .sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0))
    .map((p) => p.webVideoUrl)
    .slice(0, n);
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
