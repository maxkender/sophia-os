/**
 * Relecture native · étape 2 (migrations 0377, 0378) : le kit natif. Après
 * son questionnaire, chaque relecteur écrit les mêmes slideshows depuis
 * l'anglais, de A à Z, CTA compris : tout le kit, d'un coup.
 */

/** reprise : l'original a sa slide d'appli · forme : forme imposée · libre : essai. */
export const VOIES_KIT = ["reprise", "forme", "libre"] as const;
export type VoieKit = (typeof VOIES_KIT)[number];

export interface SlideKitEn {
  position: number;
  texte: string;
  image_url: string | null;
}

export interface PostKit {
  id: string;
  rang: number;
  contenu_id: string;
  application_id: string;
  voie: VoieKit;
  slide_cta: number | null;
  consigne_cta: string;
  a_adapter: string;
  source_url: string | null;
  slides_en: SlideKitEn[];
  actif: boolean;
}

export interface SlideEcrite {
  position: number;
  texte: string;
}

export interface EcritureKit {
  relecteur_id: string;
  kit_id: string;
  slides: SlideEcrite[];
  remarque: string;
  rendu_at: string | null;
  updated_at?: string;
}

export type EtatPostKit = "a_faire" | "en_cours" | "rendu";

/** Les posts qu'un relecteur doit écrire : ceux du kit, dans l'ordre. */
export function postsDuKit<T extends Pick<PostKit, "rang" | "actif">>(posts: ReadonlyArray<T>): T[] {
  return posts.filter((p) => p.actif).sort((a, b) => a.rang - b.rang);
}

export function etatPostKit(ecriture: Pick<EcritureKit, "slides" | "rendu_at"> | undefined): EtatPostKit {
  if (!ecriture) return "a_faire";
  if (ecriture.rendu_at) return "rendu";
  return ecriture.slides.some((s) => s.texte.trim().length > 0) ? "en_cours" : "a_faire";
}

/** Combien de posts rendus, parmi ceux que le relecteur doit écrire. */
export function avancementKit(
  posts: ReadonlyArray<Pick<PostKit, "id">>,
  ecritures: ReadonlyArray<Pick<EcritureKit, "kit_id" | "rendu_at">>,
): { rendus: number; total: number } {
  const ids = new Set(posts.map((p) => p.id));
  const rendus = ecritures.filter((e) => ids.has(e.kit_id) && e.rendu_at).length;
  return { rendus, total: posts.length };
}

/** Le texte écrit pour une slide (vide si rien). */
export function texteEcrit(slides: ReadonlyArray<SlideEcrite>, position: number): string {
  return slides.find((s) => s.position === position)?.texte ?? "";
}

/** Remplace le texte d'une slide, en gardant les autres, triées par position. */
export function avecSlideEcrite(slides: ReadonlyArray<SlideEcrite>, position: number, texte: string): SlideEcrite[] {
  return [...slides.filter((s) => s.position !== position), { position, texte }].sort((a, b) => a.position - b.position);
}

/** Le post est prêt à rendre quand chaque slide anglaise a sa version. */
export function toutesSlidesEcrites(
  slidesEn: ReadonlyArray<Pick<SlideKitEn, "position">>,
  slides: ReadonlyArray<SlideEcrite>,
): boolean {
  return slidesEn.length > 0 && slidesEn.every((s) => texteEcrit(slides, s.position).trim().length > 0);
}

/** L'accroche du post : sa première slide, sur une ligne. */
export function accrochePost(post: Pick<PostKit, "slides_en">): string {
  const premiere = [...post.slides_en].sort((a, b) => a.position - b.position)[0];
  return (premiere?.texte ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Copie figée des slides anglaises d'un contenu, comme la migration 0377 :
 * le texte d'origine (`slides_base`) quand il existe, sinon `slides`, et
 * l'image de la slide source à la même position.
 */
export function slidesKitDepuisContenu(
  langueEn: {
    slides?: ReadonlyArray<{ position: number; texte_overlay: string | null }> | null;
    slides_base?: ReadonlyArray<{ position: number; texte_overlay: string | null }> | null;
  } | null,
  structure: ReadonlyArray<{ position: number; raw_url?: string | null; reference_url?: string | null }> | null,
): SlideKitEn[] {
  const base = langueEn?.slides_base?.length ? langueEn.slides_base : (langueEn?.slides ?? []);
  return [...base]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const image = (structure ?? []).find((x) => x.position === s.position);
      return {
        position: s.position,
        texte: s.texte_overlay ?? "",
        image_url: image?.raw_url ?? image?.reference_url ?? null,
      };
    });
}
