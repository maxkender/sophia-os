/**
 * UGC IA (page /admin/ugc-ia, migration 0655) : les règles pures, partagées
 * par la fonction `ugc-ia` et ses tests. Le front a les mêmes bornes dans
 * `src/features/ugcIa/logique.ts`.
 */

/** Genjutsu refuse une source de moins de 4 s et coupe au-delà de 30 s. */
export const PASSAGE_MIN_S = 4;
export const PASSAGE_MAX_S = 30;

/**
 * Le prompt par défaut, repris du pod Réactions UGC : le persona refait le
 * mouvement, sans recopier le texte incrusté dans la source.
 */
export const PROMPT_DEFAUT =
  "the woman from the image performs exactly the motion of the video, natural phone selfie, no text, no captions";

/** Lien TikTok d'une vidéo, sans paramètres de suivi. Lève une erreur sinon. */
export function lienTiktok(brut: unknown): string {
  const u = String(brut ?? "").trim();
  if (!u) throw new Error("Lien TikTok requis");
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new Error("Lien TikTok invalide");
  }
  if (url.protocol !== "https:" || !/(^|\.)tiktok\.com$/i.test(url.hostname)) throw new Error("Lien TikTok invalide");
  return `${url.origin}${url.pathname}`;
}

function nombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Le passage à couper (en secondes) : début ≥ 0, durée entre 4 et 30 s, dans
 * la vidéo si on connaît sa durée. Rend le passage arrondi au dixième, ou
 * l'erreur à afficher.
 */
export function passage(
  debutBrut: unknown,
  finBrut: unknown,
  dureeSource: number | null,
): { debut: number; fin: number } | { erreur: string } {
  const debut = nombre(debutBrut);
  const fin = nombre(finBrut);
  if (debut == null || fin == null) return { erreur: "Début et fin requis, en secondes" };
  const d = Math.round(debut * 10) / 10;
  const f = Math.round(fin * 10) / 10;
  if (d < 0) return { erreur: "Le début ne peut pas être négatif" };
  if (f - d < PASSAGE_MIN_S) return { erreur: `Le passage doit durer au moins ${PASSAGE_MIN_S} s (Genjutsu)` };
  if (f - d > PASSAGE_MAX_S) return { erreur: `Le passage doit durer au plus ${PASSAGE_MAX_S} s` };
  // Tolérance d'un dixième : la durée annoncée par TikTok est arrondie.
  if (dureeSource != null && dureeSource > 0 && f > dureeSource + 0.1) {
    return { erreur: `La fin dépasse la vidéo (${Math.round(dureeSource * 10) / 10} s)` };
  }
  return { debut: d, fin: f };
}

/** Les fichiers d'une vidéo dans le bucket `medias`. */
export function cheminsUgcIa(id: string): { source: string; reaction: string; video: string } {
  const base = `ugc-ia/${id}`;
  return { source: `${base}/source.mp4`, reaction: `${base}/reaction.mp4`, video: `${base}/video.mp4` };
}
