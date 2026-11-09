// UGC IA (migrations 0656 à 0661, fonction `ugc-ia`) : la page lit les
// tables, la fonction fait tout le reste (import TikTok et CTA, coupe,
// Genjutsu, suivi, personas ajoutés par Claude, persona ↔ compte UGCV).

import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import type { PartieSource, ResolutionUgcIa, StatutGenerationUgcIa } from "./logique";

export interface PersonaUgcIa {
  id: string;
  nom: string;
  description: string;
  image_url: string;
  /** Vide : image encore à l'extérieur (ajoutée par Claude), à rapatrier. */
  image_path: string | null;
  /** Le compte UGCV de ce persona (1 persona = 1 compte), ou aucun. */
  compte_id: string | null;
}

/** Un compte qui porte le label UGCV, à rattacher à un persona. */
export interface CompteUgcv {
  id: string;
  handle_tiktok: string | null;
  persona_nom: string | null;
  langue: string | null;
  poster_prenom: string | null;
}

export interface GenerationUgcIa {
  id: string;
  source_id: string;
  persona_id: string;
  debut_s: number | null;
  fin_s: number | null;
  prompt: string | null;
  resolution: ResolutionUgcIa;
  statut: StatutGenerationUgcIa;
  erreur: string | null;
  /** La vidéo enregistrée : l'original de Genjutsu, ou sa version montée. */
  video_url: string | null;
  /** L'original de Genjutsu, gardé pour remonter autrement. */
  video_brute_url: string | null;
  montage_debut_s: number | null;
  montage_fin_s: number | null;
  bandeau_actif: boolean;
  bandeau_texte: string | null;
  bandeau_position: number | null;
  montage_statut: "en_cours" | "echec" | null;
  montage_erreur: string | null;
  lancee_le: string;
  generee_le: string | null;
  created_at: string;
}

/** Ce que la page envoie pour monter une vidéo générée. */
export interface DemandeMontageUgcIa {
  /** Recadrage ; null et null : toute la vidéo. */
  debut: number | null;
  fin: number | null;
  bandeau: { actif: boolean; texte: string; position: number; png?: string };
}

export interface SourceUgcIa {
  id: string;
  source_url: string;
  source_texte: string | null;
  source_vues: number | null;
  source_duree_s: number | null;
  brut_url: string | null;
  debut_s: number | null;
  fin_s: number | null;
  coupe_url: string | null;
  /** La partie téléphone (la démo de l'appli), gardée telle quelle. */
  telephone_debut_s: number | null;
  telephone_fin_s: number | null;
  telephone_url: string | null;
  cta_texte: string | null;
  cta_image_url: string | null;
  /** Le son de la vidéo de référence (relevé à l'import depuis le 0662). */
  musique_url: string | null;
  musique_titre: string | null;
  created_at: string;
  /** Les plus récentes d'abord. */
  generations: GenerationUgcIa[];
}

export interface ResultatLancement {
  personaId: string;
  nom: string | null;
  generationId?: string;
  erreur?: string;
}

export const CLE_SOURCES_UGC_IA = ["ugc-ia", "sources"] as const;
export const CLE_PERSONAS_UGC_IA = ["ugc-ia", "personas"] as const;
export const CLE_COMPTES_UGCV = ["ugc-ia", "comptes-ugcv"] as const;
export const CLE_POSTS_VIDEO = ["ugc-ia", "posts-video"] as const;
export const CLE_DEMOS = ["ugc-ia", "demos"] as const;
export const CLE_ASSEMBLAGES = ["ugc-ia", "assemblages"] as const;

const nombreOuNull = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export async function listerPersonasUgcIa(): Promise<PersonaUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_personas")
    .select("id, nom, description, image_url, image_path, compte_id")
    .eq("actif", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PersonaUgcIa[];
}

/**
 * Les comptes actifs qui portent le label UGCV (`comptes.ugcv`, migration 0661).
 * `comptes.ugcv` vaut pour tout label manuel : les comptes MOTION (0663), qui
 * reçoivent les vidéos de la page Motion, sont écartés ici.
 */
export async function listerComptesUgcv(): Promise<CompteUgcv[]> {
  const { data, error } = await supabase
    .from("comptes")
    .select("id, handle_tiktok, persona_nom, langue, profiles(prenom), compte_labels(labels(slug))")
    .eq("ugcv", true)
    .eq("is_active", true)
    .order("created_at");
  if (error) throw error;
  type Une<T> = T | T[] | null | undefined;
  type Ligne = Omit<CompteUgcv, "poster_prenom"> & {
    profiles?: Une<{ prenom: string | null }>;
    compte_labels?: Array<{ labels: Une<{ slug: string | null }> }> | null;
  };
  const slugs = (l: Ligne) =>
    (l.compte_labels ?? []).flatMap((cl) => (Array.isArray(cl.labels) ? cl.labels : cl.labels ? [cl.labels] : []).map((x) => x.slug));
  return ((data ?? []) as unknown as Ligne[])
    .filter((l) => !slugs(l).includes("motion"))
    .map((l) => ({
      id: l.id,
      handle_tiktok: l.handle_tiktok,
      persona_nom: l.persona_nom,
      langue: l.langue,
      poster_prenom: (Array.isArray(l.profiles) ? l.profiles[0]?.prenom : l.profiles?.prenom) ?? null,
    }));
}

export async function listerSourcesUgcIa(): Promise<SourceUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_sources")
    .select(
      "id, source_url, source_texte, source_vues, source_duree_s, brut_url, debut_s, fin_s, coupe_url, " +
        "telephone_debut_s, telephone_fin_s, telephone_url, cta_texte, cta_image_url, musique_url, musique_titre, created_at, " +
        "generations:ugc_ia_generations(id, source_id, persona_id, debut_s, fin_s, prompt, resolution, statut, erreur, video_url, video_brute_url, " +
        "montage_debut_s, montage_fin_s, bandeau_actif, bandeau_texte, bandeau_position, montage_statut, montage_erreur, lancee_le, generee_le, created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  // Les colonnes numeric peuvent revenir en texte selon la configuration de PostgREST.
  return ((data ?? []) as unknown as SourceUgcIa[]).map((s) => ({
    ...s,
    source_vues: nombreOuNull(s.source_vues),
    source_duree_s: nombreOuNull(s.source_duree_s),
    debut_s: nombreOuNull(s.debut_s),
    fin_s: nombreOuNull(s.fin_s),
    telephone_debut_s: nombreOuNull(s.telephone_debut_s),
    telephone_fin_s: nombreOuNull(s.telephone_fin_s),
    generations: [...(s.generations ?? [])]
      .map((g) => ({
        ...g,
        debut_s: nombreOuNull(g.debut_s),
        fin_s: nombreOuNull(g.fin_s),
        montage_debut_s: nombreOuNull(g.montage_debut_s),
        montage_fin_s: nombreOuNull(g.montage_fin_s),
        bandeau_position: nombreOuNull(g.bandeau_position),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}

export function importerTiktokUgcIa(url: string): Promise<{ source: SourceUgcIa; avertissement?: string | null }> {
  return invoke("ugc-ia", { action: "importer", url });
}

export function lireCtaUgcIa(id: string): Promise<{ source: SourceUgcIa }> {
  return invoke("ugc-ia", { action: "lire_cta", id });
}

export function enregistrerCtaUgcIa(id: string, texte: string): Promise<{ source: SourceUgcIa }> {
  return invoke("ugc-ia", { action: "enregistrer_cta", id, texte });
}

export function couperPassageUgcIa(id: string, partie: PartieSource, debut: number, fin: number): Promise<{ source: SourceUgcIa }> {
  return invoke("ugc-ia", { action: "couper", id, partie, debut, fin });
}

export function genererUgcIa(
  sourceId: string,
  personaIds: string[],
  prompt: string,
  resolution: ResolutionUgcIa,
): Promise<{ resultats: ResultatLancement[] }> {
  return invoke("ugc-ia", { action: "generer", sourceId, personaIds, prompt, resolution });
}

export function suivreGenerationsUgcIa(): Promise<{ bilan: Array<{ id: string; statut: string; erreur?: string }> }> {
  return invoke("ugc-ia", { action: "suivre" });
}

export function monterGenerationUgcIa(id: string, demande: DemandeMontageUgcIa): Promise<{ ok: true; statut: string }> {
  return invoke("ugc-ia", { action: "monter", id, ...demande });
}

export function annulerMontageUgcIa(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "annuler_montage", id });
}

export function supprimerSourceUgcIa(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_source", id });
}

export function supprimerGenerationUgcIa(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_generation", id });
}

export function rapatrierPersonasUgcIa(): Promise<{ bilan: Array<{ id: string; erreur?: string }> }> {
  return invoke("ugc-ia", { action: "rapatrier_personas" });
}

/** Rattache le persona à un compte UGCV (null : le détache) ; le compte quitte son ancien persona. */
export function assignerPersonaUgcIa(personaId: string, compteId: string | null): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "assigner_persona", personaId, compteId });
}

// --- Posts vidéo UGCV (0662) -------------------------------------------------

/** Une vidéo d'un post, dans l'ordre où le poster les met bout à bout. */
export interface VideoPostUgcv {
  id: string;
  position: number;
  url: string;
  nom: string | null;
}

export interface PostVideoUgcv {
  id: string;
  compte_id: string;
  date_publication_prevue: string;
  statut: string;
  publie_at: string | null;
  publie_url: string | null;
  hashtags: string | null;
  musique_url: string | null;
  musique_titre: string | null;
  video_cta_texte: string | null;
  video_cta_incruste: boolean;
  video_capture_url: string | null;
  handle_tiktok: string | null;
  videos: VideoPostUgcv[];
}

/** Ce que la page envoie pour créer un post vidéo (validé par la fonction `ugc-ia`). */
export interface NouveauPostVideo {
  compteId: string;
  date: string;
  videos: Array<{ url: string; chemin?: string | null; nom?: string | null; generationId?: string | null; assemblageId?: string | null }>;
  ctaTexte: string | null;
  ctaIncruste: boolean;
  captureUrl: string | null;
  legende: string | null;
  musiqueUrl: string | null;
  musiqueTitre: string | null;
  applicationId: string | null;
}

/** Les posts vidéo, les plus récents d'abord (jour de publication). */
export async function listerPostsVideo(): Promise<PostVideoUgcv[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, compte_id, date_publication_prevue, statut, publie_at, publie_url, hashtags, musique_url, musique_titre, " +
        "video_cta_texte, video_cta_incruste, video_capture_url, comptes(handle_tiktok), videos:post_videos(id, position, url, nom)",
    )
    .eq("type", "video")
    .order("date_publication_prevue", { ascending: false })
    .limit(60);
  if (error) throw error;
  type Ligne = Omit<PostVideoUgcv, "handle_tiktok"> & { comptes?: { handle_tiktok: string | null } | null };
  return ((data ?? []) as unknown as Ligne[]).map(({ comptes, ...p }) => ({
    ...p,
    handle_tiktok: comptes?.handle_tiktok ?? null,
    videos: [...(p.videos ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export function creerPostVideo(post: NouveauPostVideo): Promise<{ ok: true; postId: string }> {
  return invoke("ugc-ia", { action: "creer_post_video", ...post });
}

export function supprimerPostVideo(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_post_video", id });
}

/** Nom de fichier sûr pour le stockage (lettres, chiffres, tirets). */
export function nomFichierSur(nom: string): string {
  const point = nom.lastIndexOf(".");
  const ext = point > 0 ? nom.slice(point + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const base = (point > 0 ? nom.slice(0, point) : nom)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "fichier";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Importe un fichier (vidéo, capture) pour un post vidéo, directement dans le
 * stockage de l'OS (`medias/ugc-ia/posts/<dossier>/…`, admin seulement).
 */
export async function televerserPourPost(fichier: File, dossier: string): Promise<{ url: string; chemin: string }> {
  const chemin = `ugc-ia/posts/${dossier}/${Date.now()}-${nomFichierSur(fichier.name)}`;
  const { error } = await supabase.storage
    .from("medias")
    .upload(chemin, fichier, { contentType: fichier.type || undefined, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return { url: supabase.storage.from("medias").getPublicUrl(chemin).data.publicUrl, chemin };
}

/** Retire du stockage des fichiers importés pour un post (abandonné ou remplacés). */
export async function supprimerFichiersPost(chemins: string[]): Promise<void> {
  const aRetirer = chemins.filter((c) => c.startsWith("ugc-ia/posts/"));
  if (aRetirer.length === 0) return;
  const { error } = await supabase.storage.from("medias").remove(aRetirer);
  if (error) throw error;
}

// --- Démos et vidéos complètes (0665) ----------------------------------------

export interface DemoUgcIa {
  id: string;
  nom: string;
  /** Partie téléphone d'une source reprise comme démo (sinon vidéo importée). */
  source_id: string | null;
  brut_url: string;
  brut_duree_s: number | null;
  passages: Array<{ debut: number; fin: number }>;
  vitesse: number;
  /** La démo montée (MP4), vide tant qu'elle n'est pas montée. */
  video_url: string | null;
  duree_s: number | null;
  montage_statut: "en_cours" | "echec" | null;
  montage_erreur: string | null;
  created_at: string;
}

export interface AssemblageUgcIa {
  id: string;
  generation_id: string;
  demo_id: string | null;
  bandeau_actif: boolean;
  bandeau_texte: string | null;
  bandeau_position: number | null;
  video_url: string | null;
  duree_s: number | null;
  statut: "en_cours" | "prete" | "echec";
  erreur: string | null;
  created_at: string;
  /** La réaction : son persona et sa source. */
  persona_id: string | null;
  source_id: string | null;
  demo_nom: string | null;
}

export async function listerDemos(): Promise<DemoUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_demos")
    .select("id, nom, source_id, brut_url, brut_duree_s, passages, vitesse, video_url, duree_s, montage_statut, montage_erreur, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as DemoUgcIa[]).map((d) => ({
    ...d,
    brut_duree_s: nombreOuNull(d.brut_duree_s),
    duree_s: nombreOuNull(d.duree_s),
    vitesse: Number(d.vitesse) || 1,
    passages: Array.isArray(d.passages) ? d.passages.map((p) => ({ debut: Number(p.debut), fin: Number(p.fin) })) : [],
  }));
}

export async function listerAssemblages(): Promise<AssemblageUgcIa[]> {
  const { data, error } = await supabase
    .from("ugc_ia_assemblages")
    .select(
      "id, generation_id, demo_id, bandeau_actif, bandeau_texte, bandeau_position, video_url, duree_s, statut, erreur, created_at, " +
        "generation:ugc_ia_generations(persona_id, source_id), demo:ugc_ia_demos(nom)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  type Ligne = Omit<AssemblageUgcIa, "persona_id" | "source_id" | "demo_nom"> & {
    generation?: { persona_id: string; source_id: string } | null;
    demo?: { nom: string } | null;
  };
  return ((data ?? []) as unknown as Ligne[]).map(({ generation, demo, ...a }) => ({
    ...a,
    duree_s: nombreOuNull(a.duree_s),
    bandeau_position: nombreOuNull(a.bandeau_position),
    persona_id: generation?.persona_id ?? null,
    source_id: generation?.source_id ?? null,
    demo_nom: demo?.nom ?? null,
  }));
}

/** Dépose dans le stockage de l'OS un fichier de la page (vidéo importée, rendu). Admin seulement. */
export async function deposerFichier(fichier: Blob, chemin: string, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from("medias").upload(chemin, fichier, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabase.storage.from("medias").getPublicUrl(chemin).data.publicUrl;
}

/** Importe une démo de l'ordinateur dans la bibliothèque. */
export async function importerDemo(fichier: File, dureeS: number | null): Promise<{ demo: DemoUgcIa }> {
  const chemin = `ugc-ia/demos/${crypto.randomUUID()}/brut-${nomFichierSur(fichier.name)}`;
  const brutUrl = await deposerFichier(fichier, chemin, fichier.type || "video/mp4");
  const nom = fichier.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Démo";
  return invoke("ugc-ia", { action: "ajouter_demo", nom, brutUrl, brutPath: chemin, dureeS });
}

/** La partie téléphone d'une source, reprise dans la bibliothèque (une fois). */
export function ajouterDemoDeSource(sourceId: string): Promise<{ demo: DemoUgcIa }> {
  return invoke("ugc-ia", { action: "ajouter_demo", sourceId });
}

/** Dépose le rendu de la démo montée et le fait réencoder (en arrière-plan). */
export async function finaliserDemo(
  id: string,
  rendu: { blob: Blob; mime: string },
  passages: Array<{ debut: number; fin: number }>,
  vitesse: number,
): Promise<{ ok: true; statut: string }> {
  const ext = rendu.mime.startsWith("video/mp4") ? "mp4" : "webm";
  const renduPath = `ugc-ia/demos/${id}/rendu-${Date.now()}.${ext}`;
  await deposerFichier(rendu.blob, renduPath, rendu.mime.split(";")[0]);
  return invoke("ugc-ia", { action: "finaliser_demo", id, renduPath, passages, vitesse });
}

export function supprimerDemo(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_demo", id });
}

/** Dépose le rendu de la vidéo complète et le fait réencoder (en arrière-plan). */
export async function finaliserAssemblage(
  generationId: string,
  demoId: string,
  rendu: { blob: Blob; mime: string },
  bandeau: { actif: boolean; texte: string; position: number },
): Promise<{ ok: true; id: string; statut: string }> {
  const ext = rendu.mime.startsWith("video/mp4") ? "mp4" : "webm";
  const renduPath = `ugc-ia/assemblages/rendus/${crypto.randomUUID()}.${ext}`;
  await deposerFichier(rendu.blob, renduPath, rendu.mime.split(";")[0]);
  return invoke("ugc-ia", { action: "finaliser_assemblage", generationId, demoId, renduPath, bandeau });
}

export function supprimerAssemblage(id: string): Promise<{ ok: true }> {
  return invoke("ugc-ia", { action: "supprimer_assemblage", id });
}
