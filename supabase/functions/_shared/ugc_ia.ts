/**
 * UGC IA (page /admin/ugc-ia, migrations 0656 et 0657) : les règles pures, partagées
 * par la fonction `ugc-ia` et ses tests. Le front a les mêmes bornes dans
 * `src/features/ugcIa/logique.ts`.
 */

/**
 * Genjutsu coupe au-delà de 30 s. Pas de minimum côté OS (décision du 5/11) :
 * la doc de l'API annonce 4 s, mais c'est Higgsfield qui tranche ; un refus
 * revient en échec, non facturé.
 */
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
 * Le passage à couper (en secondes) : début ≥ 0, fin après le début, 30 s au
 * plus, dans la vidéo si on connaît sa durée. Rend le passage arrondi au dixième, ou
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
  if (f <= d) return { erreur: "La fin doit être après le début" };
  if (f - d > PASSAGE_MAX_S) return { erreur: `Le passage doit durer au plus ${PASSAGE_MAX_S} s` };
  // Tolérance d'un dixième : la durée annoncée par TikTok est arrondie.
  if (dureeSource != null && dureeSource > 0 && f > dureeSource + 0.1) {
    return { erreur: `La fin dépasse la vidéo (${Math.round(dureeSource * 10) / 10} s)` };
  }
  return { debut: d, fin: f };
}

/** Les fichiers d'une source dans le bucket `medias` (un dossier par source). */
export function cheminsUgcIa(sourceId: string): { source: string; reaction: string; cta: string } {
  const base = `ugc-ia/${sourceId}`;
  return { source: `${base}/source.mp4`, reaction: `${base}/reaction.mp4`, cta: `${base}/cta.jpg` };
}

/** La vidéo d'une génération, rangée avec sa source. */
export function cheminGeneration(sourceId: string, generationId: string): string {
  return `ugc-ia/${sourceId}/${generationId}.mp4`;
}

/** L'image d'un persona une fois copiée dans le stockage de l'OS. */
export function cheminPersona(personaId: string, mime: string): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `ugc-ia/personas/${personaId}.${ext}`;
}

/** Au plus 10 personas par lancement : 10 générations facturées d'un clic. */
export const PERSONAS_MAX_PAR_LANCEMENT = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les personas cochés : identifiants valides, sans doublon, 1 à 10. */
export function personasDemandees(brut: unknown): string[] | { erreur: string } {
  const liste = Array.isArray(brut) ? brut : [];
  const ids = [...new Set(liste.map((x) => String(x ?? "").trim().toLowerCase()).filter((x) => UUID.test(x)))];
  if (ids.length === 0) return { erreur: "Coche au moins un persona" };
  if (ids.length > PERSONAS_MAX_PAR_LANCEMENT) return { erreur: `${PERSONAS_MAX_PAR_LANCEMENT} personas au plus par lancement` };
  return ids;
}

/** L'image rendue par fal `ffmpeg-api/extract-frame` (`images[0].url`), ou null. */
export function urlImageExtraite(sortie: unknown): string | null {
  const s = (sortie ?? {}) as { data?: unknown; images?: unknown };
  const corps = (s.images ? s : (s.data ?? {})) as { images?: Array<{ url?: unknown }> };
  const url = Array.isArray(corps.images) ? corps.images[0]?.url : null;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

/** Le CTA lu par l'OCR, nettoyé (l'OCR rend parfois des lignes vides ou des guillemets). */
export function nettoyerCta(texte: unknown): string {
  return String(texte ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/^["«“]\s*|\s*["»”]$/g, "")
    .slice(0, 500);
}
