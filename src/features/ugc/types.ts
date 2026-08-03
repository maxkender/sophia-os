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
