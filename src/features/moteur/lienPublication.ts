/**
 * Le lien TikTok que le créateur colle en marquant un post publié.
 *
 * Un lien court (« Partager » dans l'app : vm / vt / t) ne contient pas l'ID du
 * post. On le résout avant d'enregistrer pour stocker le lien complet : la
 * file de reviews, la relecture automatique et le relevé de vues ont besoin de
 * l'ID, et c'est lui que le trigger `posts_refuser_lien_deja_utilise` compare
 * pour refuser un post déjà déclaré pour un autre slideshow (asya.ogrenir761
 * et mia.thrives282 le 15/10).
 */
import { estLienCourtTiktok, idTiktokDepuisUrl } from "@/features/reviews/tiktokEmbed";

import { messageDErreur } from "./delaiPublication";

/**
 * Lien à enregistrer : le lien complet du post quand un lien court se résout,
 * sinon le lien tel quel (le serveur tranchera, la résolution des
 * publications le rattrapera).
 */
export async function lienPourEnregistrement(
  saisi: string,
  resoudre: (url: string) => Promise<{ url: string; id: string | null }>,
): Promise<string> {
  const lien = saisi.trim();
  if (!estLienCourtTiktok(lien)) return lien;
  try {
    const { url } = await resoudre(lien);
    if (!idTiktokDepuisUrl(url)) return lien;
    // Sans les paramètres de partage (?_r=…&_t=…) : un même post, un même lien.
    return url.replace(/[?#].*$/, "");
  } catch {
    return lien;
  }
}

/**
 * Date (« 15/10 01:02 ») du post qui utilise déjà ce lien, lue dans le refus du
 * serveur (`LIEN_DEJA_UTILISE:<date>`) ; null si l'erreur vient d'ailleurs.
 */
export function dateDepuisErreurLienDejaUtilise(erreur: unknown): string | null {
  const m = /LIEN_DEJA_UTILISE:([^—]+?)\s*(?:—|$)/.exec(messageDErreur(erreur));
  return m ? m[1].trim() : null;
}

/**
 * Prompt 25 MAJ, 7d : le @ d'un lien de post qui n'est pas celui du compte
 * (« This link is from @x, not your account @y. »). null : même compte, ou un
 * lien qui ne dit pas son @ (lien court pas résolu).
 */
export function handleAutreCompte(lien: string | null | undefined, handleCompte: string | null | undefined): string | null {
  const m = String(lien ?? "").match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  const duLien = m?.[1]?.toLowerCase() ?? null;
  const attendu = String(handleCompte ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!duLien || !attendu) return null;
  return duLien === attendu ? null : duLien;
}
