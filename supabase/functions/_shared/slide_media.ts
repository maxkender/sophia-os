/**
 * Lien atomique slide → media_library (évite les lost-updates parallèles
 * qui remettaient le brut avec texte après un Fal/Replicate OK).
 */

import { serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/** Propre déjà uploadé pour cette slide (même si structure_slides n'a pas suivi). */
export async function trouverPropreExistant(
  supabase: Supabase,
  contenuId: string,
  position: number,
): Promise<{ id: string; url: string; storage_path: string } | null> {
  const prefix = `propre/${contenuId}/${position}.`;
  const { data, error } = await supabase
    .from("media_library")
    .select("id, url, storage_path, texte_restant, verifie_le")
    .eq("contenu_id", contenuId)
    .like("storage_path", `${prefix}%`)
    .order("verifie_le", { ascending: false })
    .limit(5);
  if (error) throw error;
  const ok = (data ?? []).find((m) => m.texte_restant !== true);
  if (!ok) return null;
  return {
    id: ok.id as string,
    url: ok.url as string,
    storage_path: ok.storage_path as string,
  };
}

/** Écrit media_id sur UNE position sans écraser les autres slides. */
export async function patchSlideMediaId(
  supabase: Supabase,
  contenuId: string,
  position: number,
  mediaId: string,
): Promise<void> {
  const { error } = await supabase.rpc("patch_contenu_slide_media", {
    p_contenu_id: contenuId,
    p_position: position,
    p_media_id: mediaId,
    p_clear_tentatives: true,
  });
  if (error) throw error;
}

/**
 * Propager un nouveau propre vers les `post_slides` des posts déjà matérialisés
 * pour ce contenu (passages.post_id). Texte overlay inchangé — media_id seul.
 * Les futurs assignements lisent déjà `structure_slides` à la matérialisation.
 */
export async function propagerMediaAuxPostsAssignes(
  supabase: Supabase,
  contenuId: string,
  position: number,
  mediaId: string,
): Promise<number> {
  const { data: passages, error } = await supabase
    .from("passages")
    .select("post_id")
    .eq("contenu_id", contenuId)
    .not("post_id", "is", null);
  if (error) throw error;

  const postIds = [
    ...new Set(
      (passages ?? [])
        .map((p) => p.post_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (postIds.length === 0) return 0;

  const { data: updated, error: updErr } = await supabase
    .from("post_slides")
    .update({ media_id: mediaId })
    .in("post_id", postIds)
    .eq("position", position)
    .select("id");
  if (updErr) throw updErr;
  return updated?.length ?? 0;
}
