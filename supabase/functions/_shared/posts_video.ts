/**
 * Un post vidéo (migration 0662), compté comme un post normal : le post (type
 * `video`, assigné, prêt), ses vidéos dans l'ordre où le poster les met bout à
 * bout, et un passage sans contenu que lisent la paie, les relances, la
 * résolution du lien et le relevé des vues.
 *
 * Partagé par `ugc-ia` (posts UGCV posés à la main) et `motion` (vidéo Motion
 * validée, 0663). Les contrôles (compte UGCV, 1 post par jour…) restent chez
 * l'appelant. Si une étape échoue, le post est retiré : rien de bancal ne reste.
 */

// deno-lint-ignore no-explicit-any
type Supabase = any;

export interface VideoAPoser {
  url: string;
  /** Chemin dans `medias` d'une vidéo importée pour ce post (supprimée avec lui) ; vide sinon. */
  chemin: string | null;
  nom: string | null;
  generationId: string | null;
}

export interface PostVideoAPoser {
  compteId: string;
  date: string;
  /** Langue du passage : celle du compte. */
  langue: string;
  videos: VideoAPoser[];
  legende: string | null;
  ctaTexte: string | null;
  ctaIncruste: boolean;
  captureUrl: string | null;
  musiqueUrl: string | null;
  musiqueTitre: string | null;
  applicationId: string | null;
}

/** Pose le post, ses vidéos et son passage ; rend l'id du post. */
export async function poserPostVideo(supabase: Supabase, d: PostVideoAPoser): Promise<string> {
  const application = d.applicationId ? { application_id: d.applicationId } : {};
  const musique = d.musiqueUrl
    ? { musique_url: d.musiqueUrl, musique_titre: d.musiqueTitre, musique_plateforme: "tiktok" }
    : {};
  const { data: post, error: errP } = await supabase
    .from("posts")
    .insert({
      compte_id: d.compteId,
      date_publication_prevue: d.date,
      type: "video",
      statut: "assigne",
      pipeline_statut: "done",
      hashtags: d.legende,
      video_cta_texte: d.ctaTexte,
      video_cta_incruste: d.ctaIncruste,
      video_capture_url: d.captureUrl,
      ...musique,
      ...application,
    })
    .select("id")
    .single();
  if (errP || !post) throw new Error(errP?.message ?? "post non créé");

  try {
    const { error: errV } = await supabase.from("post_videos").insert(
      d.videos.map((v, i) => ({
        post_id: post.id,
        position: i + 1,
        url: v.url,
        chemin: v.chemin,
        nom: v.nom,
        generation_id: v.generationId,
      })),
    );
    if (errV) throw new Error(errV.message);
    const { error: errPa } = await supabase.from("passages").insert({
      contenu_id: null,
      post_id: post.id,
      compte_id: d.compteId,
      langue: d.langue,
      date_publication_prevue: d.date,
      statut: "assigne",
      slides: [],
      hashtags: d.legende,
      ...musique,
      ...application,
    });
    if (errPa) throw new Error(errPa.message);
  } catch (e) {
    await supabase.from("posts").delete().eq("id", post.id);
    throw e;
  }
  return post.id as string;
}
