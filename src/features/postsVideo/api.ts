// Posts vidéo des comptes UGCV (migration 0662) : leurs vidéos, dans l'ordre.
// Le post lui-même se lit comme les autres (`posts`) ; qui voit le post voit
// ses vidéos (règles de `post_videos`).

import { supabase } from "@/lib/supabase/client";

export interface VideoDuPost {
  id: string;
  position: number;
  url: string;
  nom: string | null;
}

export async function listerVideosPost(postId: string): Promise<VideoDuPost[]> {
  const { data, error } = await supabase
    .from("post_videos")
    .select("id, position, url, nom")
    .eq("post_id", postId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as VideoDuPost[];
}
