/**
 * 18/11 (Max) : « Bible des comptes ». Partie sans réseau (testée) : lire un lien TikTok, choisir les 3 posts
 * de référence d'un profil, calculer les stats, nommer la copie d'une miniature dans notre stockage.
 */

/** Le handle d'un lien de profil ou de post TikTok, ou d'un « @handle » collé tel quel. */
export function handleDeLien(texte: string): string | null {
  const t = texte.trim();
  const m = t.match(/tiktok\.com\/@([A-Za-z0-9._]{1,40})/i) ?? t.match(/^@?([A-Za-z0-9._]{1,40})$/);
  return m ? m[1]!.toLowerCase() : null;
}

/** L'identifiant numérique d'un post (/video/123 ou /photo/123). */
export function idPost(lien: string): string | null {
  const m = lien.match(/\/(?:video|photo)\/(\d{8,25})/);
  return m ? m[1]! : null;
}

/** Un lien de post TikTok utilisable (profil + identifiant). */
export function estLienPost(lien: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[A-Za-z0-9._]{1,40}\/(?:video|photo)\/\d{8,25}/i.test(lien.trim());
}

/** Un lien court TikTok (à suivre pour connaître le compte). */
export function estLienCourt(lien: string): boolean {
  return /^https?:\/\/(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+\/?$|^https?:\/\/(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9]+\/?$/i.test(lien.trim());
}

export interface PostBible {
  url: string;
  miniature_path?: string | null;
  miniature_url?: string | null;
  vues?: number | null;
  erreur?: string | null;
}

/** Le chemin de la copie dans le bucket medias : bible/<handle>/<id du post>.jpg (stable, écrasé au rafraîchissement). */
export function cheminMiniature(handle: string, lien: string, rang: number): string {
  return `bible/${handle}/${idPost(lien) ?? `post-${rang + 1}`}.jpg`;
}

export interface PostProfil {
  url: string;
  vues: number;
  createTime: number | null;
}

/** Les 3 posts les plus vus parmi les ~12 derniers du profil. */
export function troisMeilleurs(posts: PostProfil[]): PostProfil[] {
  return [...posts]
    .filter((p) => estLienPost(p.url))
    .sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0))
    .slice(0, 12)
    .sort((a, b) => b.vues - a.vues)
    .slice(0, 3);
}

/** 19/11 (Max) : les 3 derniers TikToks (les plus récents d'abord). */
export function troisDerniers(posts: PostProfil[]): PostProfil[] {
  return [...posts].filter((p) => estLienPost(p.url)).sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0)).slice(0, 3);
}

export function mediane(valeurs: number[]): number | null {
  const v = valeurs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}

/** Les stats d'un profil à partir de ses derniers posts. */
export function statsProfil(posts: PostProfil[], abonnes: number | null): Record<string, unknown> {
  const recents = [...posts].sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0)).slice(0, 12);
  const meilleur = [...recents].sort((a, b) => b.vues - a.vues)[0];
  const dernier = recents[0]?.createTime;
  const s: Record<string, unknown> = {};
  if (abonnes != null) s.abonnes = abonnes;
  const med = mediane(recents.map((p) => p.vues));
  if (med != null) s.vues_mediane = med;
  if (meilleur) {
    s.meilleur_post_url = meilleur.url;
    s.meilleur_post_vues = meilleur.vues;
  }
  if (dernier) s.dernier_post_le = new Date(dernier * 1000).toISOString().slice(0, 10);
  return s;
}

/**
 * 24/11 : les rangs des posts d'exemple d'une proposition dont il reste à chercher la miniature (les 3 premiers :
 * un vrai lien de post, sans miniature ni erreur déjà notée).
 */
export function exemplesSansApercu(exemples: unknown): number[] {
  if (!Array.isArray(exemples)) return [];
  return exemples.slice(0, 3).flatMap((e, i) => {
    const x = (e ?? {}) as { url?: unknown; miniature_url?: unknown; erreur?: unknown };
    return typeof x.url === "string" && estLienPost(x.url) && !x.miniature_url && !x.erreur ? [i] : [];
  });
}
