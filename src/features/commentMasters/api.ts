import { invoke } from "@/features/moteur/api";

/** Clé du prompt des comment masters dans la table `prompts` (cf. supabase/functions/_shared/comment_masters.ts). */
export const CLE_PROMPT_COMMENT_MASTER = "comment_master";

/** Variables que la fonction remplace à chaque post. */
export const VARIABLES_PROMPT = ["langue", "appli", "slides", "hashtags"] as const;

export interface ApercuCommentaire {
  lien: string;
  handle: string | null;
  langue: string;
  appli: string;
  vues: number;
  accroche: string | null;
  commentaire: string;
  traduction: string;
  problemes: string[];
}

/**
 * Génère les commentaires des derniers posts DE / IT au-dessus de 8 000 vues
 * avec un prompt BROUILLON : rien n'est enregistré ni envoyé sur Slack.
 */
export async function testerPromptCommentaires(prompt: string, n = 6): Promise<ApercuCommentaire[]> {
  const r = await invoke<{ ok: boolean; apercu: ApercuCommentaire[] }>("comment-masters", { apercu: n, prompt });
  return r.apercu ?? [];
}
