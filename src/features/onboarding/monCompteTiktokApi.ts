import { invoke } from "@/features/moteur/api";

export interface IssueHandle {
  ok: boolean;
  statut?: "trouve" | "introuvable" | "illisible";
  handle?: string;
  /** Le texte de l'OS (réglages handle_trouve_texte / handle_pas_trouve_texte). */
  message?: string | null;
  error?: string;
}

/** 0444 : « My account has a different name » ; le @ est lu tout de suite sur TikTok. */
export async function proposerHandle(handle: string, compteId: string | null): Promise<IssueHandle> {
  return await invoke<IssueHandle>("ckd", { action: "handle_proposer", handle, compte_id: compteId });
}
