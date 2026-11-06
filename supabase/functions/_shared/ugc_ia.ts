/**
 * UGC IA (page /admin/ugc-ia, migrations 0656 à 0660) : les règles pures, partagées
 * par la fonction `ugc-ia` et ses tests. Le front a les mêmes bornes dans
 * `src/features/ugcIa/logique.ts`.
 */

/**
 * Genjutsu coupe au-delà de 30 s. Pas de minimum côté OS (décision du 5/11) :
 * la doc de l'API annonce 4 s, mais c'est Higgsfield qui tranche ; un refus
 * revient en échec, non facturé.
 */
export const PASSAGE_MAX_S = 30;

/** La partie téléphone (la démo de l'appli) ne passe pas par Genjutsu : plafond plus large. */
export const TELEPHONE_MAX_S = 180;

/** Les deux parties qu'on coupe dans une source. */
export type PartieSource = "reaction" | "telephone";

export function partieSource(brut: unknown): PartieSource | null {
  const p = String(brut ?? "reaction");
  return p === "reaction" || p === "telephone" ? p : null;
}

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
 * Le passage à couper (en secondes) : début ≥ 0, fin après le début, `max`
 * secondes au plus (30 pour la réaction, la limite de Genjutsu), dans la vidéo
 * si on connaît sa durée. Rend le passage arrondi au dixième, ou l'erreur à
 * afficher.
 */
export function passage(
  debutBrut: unknown,
  finBrut: unknown,
  dureeSource: number | null,
  max = PASSAGE_MAX_S,
): { debut: number; fin: number } | { erreur: string } {
  const debut = nombre(debutBrut);
  const fin = nombre(finBrut);
  if (debut == null || fin == null) return { erreur: "Début et fin requis, en secondes" };
  const d = Math.round(debut * 10) / 10;
  const f = Math.round(fin * 10) / 10;
  if (d < 0) return { erreur: "Le début ne peut pas être négatif" };
  if (f <= d) return { erreur: "La fin doit être après le début" };
  if (f - d > max) return { erreur: `Le passage doit durer au plus ${max} s` };
  // Tolérance d'un dixième : la durée annoncée par TikTok est arrondie.
  if (dureeSource != null && dureeSource > 0 && f > dureeSource + 0.1) {
    return { erreur: `La fin dépasse la vidéo (${Math.round(dureeSource * 10) / 10} s)` };
  }
  return { debut: d, fin: f };
}

/** Les fichiers d'une source dans le bucket `medias` (un dossier par source). */
export function cheminsUgcIa(sourceId: string): { source: string; reaction: string; telephone: string; cta: string } {
  const base = `ugc-ia/${sourceId}`;
  return {
    source: `${base}/source.mp4`,
    reaction: `${base}/reaction.mp4`,
    telephone: `${base}/telephone.mp4`,
    cta: `${base}/cta.jpg`,
  };
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

/**
 * Rattacher un persona à un compte UGCV (`compteId` null : le détacher).
 * 1 persona = 1 compte : le compte est repris à l'ancien persona s'il en avait un.
 */
export function demandeAssignation(body: Record<string, unknown>): { personaId: string; compteId: string | null } | { erreur: string } {
  const personaId = String(body.personaId ?? "").trim().toLowerCase();
  if (!UUID.test(personaId)) return { erreur: "Persona manquant" };
  if (body.compteId === null || body.compteId === undefined || body.compteId === "") return { personaId, compteId: null };
  const compteId = String(body.compteId).trim().toLowerCase();
  if (!UUID.test(compteId)) return { erreur: "Compte invalide" };
  return { personaId, compteId };
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

/** Les fichiers du montage d'une génération, rangés avec sa vidéo. */
export function cheminsMontage(sourceId: string, generationId: string): { coupe: string; bandeau: string; monte: string } {
  const base = `ugc-ia/${sourceId}/${generationId}`;
  return { coupe: `${base}-coupe.mp4`, bandeau: `${base}-bandeau.png`, monte: `${base}-monte.mp4` };
}

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** L'image du bandeau envoyée par la page (PNG en base64, avec ou sans préfixe data:), ou null. */
export function pngDepuisBase64(brut: unknown): Uint8Array | null {
  const s = String(brut ?? "").replace(/^data:image\/png;base64,/, "").trim();
  if (!s || s.length > 4_000_000) return null;
  let binaire: string;
  try {
    binaire = atob(s);
  } catch {
    return null;
  }
  const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
  return SIGNATURE_PNG.every((v, i) => octets[i] === v) ? octets : null;
}

export interface DemandeMontage {
  /** Recadrage dans le temps de la vidéo générée ; null : toute la vidéo. */
  debut: number | null;
  fin: number | null;
  /** Le texte et la hauteur (0 = haut, 100 = bas) du bandeau, gardés même s'il est retiré. */
  bandeauTexte: string | null;
  bandeauPosition: number | null;
  /** Le bandeau à poser, rendu par la page ; null : pas de bandeau. */
  bandeau: { png: Uint8Array } | null;
}

/** Lit une demande de montage : coupe (début et fin ensemble) et bandeau. */
export function demandeMontage(body: Record<string, unknown>): DemandeMontage | { erreur: string } {
  const d = nombre(body.debut);
  const f = nombre(body.fin);
  if ((d == null) !== (f == null)) return { erreur: "Indique le début et la fin ensemble" };
  let debut: number | null = null;
  let fin: number | null = null;
  if (d != null && f != null) {
    const p = passage(d, f, null);
    if ("erreur" in p) return p;
    debut = p.debut;
    fin = p.fin;
  }
  const b = (body.bandeau ?? null) as { actif?: unknown; texte?: unknown; position?: unknown; png?: unknown } | null;
  const texte = b ? String(b.texte ?? "").trim() : "";
  if (texte.length > 300) return { erreur: "Le bandeau fait 300 caractères au plus" };
  const position = b ? nombre(b.position) : null;
  if (position != null && (position < 0 || position > 100)) return { erreur: "Hauteur du bandeau : de 0 à 100" };
  let bandeau: DemandeMontage["bandeau"] = null;
  if (b?.actif === true) {
    if (!texte) return { erreur: "Écris le texte du bandeau" };
    if (position == null) return { erreur: "Choisis la hauteur du bandeau" };
    const png = pngDepuisBase64(b.png);
    if (!png) return { erreur: "Image du bandeau illisible : recharge la page et réessaie" };
    bandeau = { png };
  }
  return {
    debut,
    fin,
    bandeauTexte: texte || null,
    bandeauPosition: position == null ? null : Math.round(position),
    bandeau,
  };
}

/** Une coupe qui garde toute la vidéo ne sert à rien (à un dixième près). */
export function coupeUtile(debut: number | null, fin: number | null, duree: number | null): boolean {
  if (debut == null || fin == null) return false;
  if (duree == null || !(duree > 0)) return true;
  return debut > 0.05 || fin < duree - 0.1;
}

/** La vidéo rendue par fal (`video.url` ou `video_url`), avec ou sans enveloppe `data`. */
export function urlVideoFal(sortie: unknown): string | null {
  const s = (sortie ?? {}) as { data?: unknown };
  const corps = ((s as { video?: unknown; video_url?: unknown }).video || (s as { video_url?: unknown }).video_url ? s : (s.data ?? {})) as {
    video?: { url?: unknown };
    video_url?: unknown;
  };
  const url = corps.video?.url ?? corps.video_url;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}
