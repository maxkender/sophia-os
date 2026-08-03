export interface UgcPersona {
  id: string;
  nom: string;
  prompt_base: string;
  prompt_left: string | null;
  prompt_right: string | null;
  prompt_down: string | null;
  prompt_profile: string | null;
  image_face_url: string;
  image_left_url: string;
  image_right_url: string;
  image_down_url: string;
  image_profile_url: string | null;
  storage_prefix: string | null;
  created_at: string;
  updated_at: string;
}

export interface UgcPersonaDefaults {
  promptFace: string;
  promptLeft: string;
  promptRight: string;
  promptDown: string;
  promptProfile: string;
}

export type UgcAngle = "left" | "right" | "down";

export interface UgcReaction {
  id: string;
  titre: string;
  source_url: string;
  tiktok_post_id: string | null;
  caption_source: string | null;
  video_source_path: string;
  video_source_url: string;
  video_path: string | null;
  video_url: string | null;
  crop: { x: number; y: number; w: number; h: number } | null;
  first_frame_reference_path: string | null;
  first_frame_reference_url: string | null;
  video_text: string | null;
  musique_url: string | null;
  musique_titre: string | null;
  duree_ms: number | null;
  largeur: number | null;
  hauteur: number | null;
  statut: "brouillon" | "pret" | "archive";
  created_at: string;
  updated_at: string;
}
