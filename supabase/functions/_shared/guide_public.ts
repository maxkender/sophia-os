/**
 * Le Poster Guide, en lien public (site Notion publié). Les posteurs n'ont pas
 * accès à app.notion.com ni à www.notion.so : tout lien du guide qui leur est
 * donné (bienvenue, relances, bot FAQ) passe par ce site.
 */
export const SITE_GUIDE_PUBLIC = "https://star-water-a0e.notion.site";
export const GUIDE_POSTER_PUBLIC = `${SITE_GUIDE_PUBLIC}/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505`;

/** app.notion.com/p/… et notion.so/… → le site public (même page, paramètres retirés). api.notion.com n'est jamais touché. */
export function liensPublics(texte: string): string {
  return texte.replace(
    /https?:\/\/(?:app\.notion\.com\/p|(?:www\.)?notion\.so)\/([A-Za-z0-9-]+)(?:\?[A-Za-z0-9_=&%-]*)?/g,
    `${SITE_GUIDE_PUBLIC}/$1`,
  );
}
