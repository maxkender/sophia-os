/** Slug du label système « Hook » (1ʳᵉ slide d'un slideshow). */
export const SLUG_HOOK = "hook";

export const CAPTION_MAX = 180;

export type CaptionStatut = "ok" | "aucune";
export type CaptionModele = "florence" | "moondream" | "none";

export function estLabelSysteme(lab: { slug?: string | null }): boolean {
  const slug = lab.slug ?? "";
  return slug === "ugc-ai-video" || slug === SLUG_HOOK;
}

/** Pool UGC AI VIDEO (marque ou label thématique) — réservé aux HM/DM vidéo. */
export function estLabelPoolUgcAiVideo(lab: {
  slug?: string | null;
  ugc_ai_video?: boolean | null;
}): boolean {
  return Boolean(lab.ugc_ai_video) || lab.slug === "ugc-ai-video";
}

export function estLabelHook(lab: { slug?: string | null }): boolean {
  return (lab.slug ?? "") === SLUG_HOOK;
}

/** Réponses vision vides / placeholder → échec, on enchaîne le fallback. */
export function captionEstVide(texte: string | null | undefined): boolean {
  if (!texte) return true;
  const t = texte.replace(/\s+/g, " ").trim();
  if (t.length < 3) return true;
  return /^(none|n\/a|null|undefined|empty|\(aucun texte\)|no caption|unknown)\.?$/i.test(t);
}

/** Première phrase, plafonnée — Florence « more-detailed » est trop long pour l'UI. */
export function raccourcirCaption(brut: string, max = CAPTION_MAX): string {
  const t = brut.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const phrase = t.split(/(?<=[.!?])\s+/)[0] ?? t;
  const source = phrase.length <= max * 1.4 ? phrase : t;
  if (source.length <= max) return source;
  const coupe = source.slice(0, max - 1);
  const dernierEspace = coupe.lastIndexOf(" ");
  const base = (dernierEspace > 40 ? coupe.slice(0, dernierEspace) : coupe).trim();
  return `${base}…`;
}

function texteDepuisObjet(o: Record<string, unknown>): string {
  const cles = ["results", "result", "output", "text", "caption", "description", "response"];
  for (const k of cles) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  const nested = o.data;
  if (nested && typeof nested === "object") {
    return texteDepuisObjet(nested as Record<string, unknown>);
  }
  return "";
}

/** Extrait le texte renvoyé par Florence-2 (`results`) ou un VLM générique. */
export function extraireCaptionFal(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (!data || typeof data !== "object") return "";
  return texteDepuisObjet(data as Record<string, unknown>).trim();
}

export function extraireMoondream(data: unknown): string {
  return extraireCaptionFal(data);
}

export function normaliserCaptionOk(brut: string): string | null {
  const court = raccourcirCaption(brut);
  return captionEstVide(court) ? null : court;
}

export interface SlideHookCandidat {
  position?: number | null;
  media_id?: string | null;
}

/** La 1ʳᵉ slide d'un slideshow (position 1) porte le label Hook. */
export function mediaEstPremiereSlide(
  mediaId: string,
  slides: SlideHookCandidat[] | null | undefined,
): boolean {
  if (!mediaId) return false;
  return (slides ?? []).some(
    (s) => s.media_id === mediaId && Number(s.position) === 1,
  );
}

export function idsPremiereSlide(
  slides: SlideHookCandidat[] | null | undefined,
): string[] {
  return [
    ...new Set(
      (slides ?? [])
        .filter((s) => Number(s.position) === 1 && s.media_id)
        .map((s) => s.media_id as string),
    ),
  ];
}

/** `propre/{contenu}/1.jpg` ou `brut/{contenu}/1`. */
export function pathEstPremiereSlide(storagePath: string | null | undefined): boolean {
  return /(?:^|\/)(?:propre|brut)\/[^/]+\/1(?:\.|$)/.test(storagePath ?? "");
}
