import { demarrerWarmup } from "@/features/moteur/api";

/** Prompt 25 MAJ, point 7b : Start warmup après lecture du @ sur TikTok. */
export type IssueStart = "trouve" | "illisible" | "introuvable" | "invalide";

export async function demarrerAvecHandle(compteId: string, handle: string): Promise<{ issue: IssueStart; handle: string }> {
  const r = await demarrerWarmup(compteId, handle);
  if (!r.ok) {
    if (r.error === "compte_introuvable") return { issue: "introuvable", handle: r.handle ?? handle };
    if (r.error === "handle_invalide") return { issue: "invalide", handle };
    throw new Error(r.error ?? "start_warmup");
  }
  return { issue: r.verification?.statut ?? "trouve", handle: r.verification?.handle ?? handle };
}
