import { demarrerWarmup } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

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

/** Point 7c : la dernière déclaration « Warm-up done » d'un compte (0449). */
export interface DeclarationWarmup {
  statut: "a_verifier" | "valide" | "refuse" | null;
  declare_at: string | null;
  decide_at: string | null;
  trouve_une_fois: boolean;
  pret: boolean;
}

export async function lireDeclarationWarmup(compteId: string): Promise<DeclarationWarmup | null> {
  const { data, error } = await supabase.rpc("warmup_declaration", { p_compte: compteId });
  if (error) throw error;
  return ((data ?? []) as DeclarationWarmup[])[0] ?? null;
}

/** La capture du profil va dans submission-media/{uid}/warmup/… ; Lucia la vérifie dans Needs you. */
export async function declarerWarmupFini(compteId: string, uid: string, fichier: File): Promise<{ ok: boolean; error?: string; deja?: boolean }> {
  const ext = (fichier.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const chemin = `${uid}/warmup/${compteId}-${Date.now()}.${ext}`;
  const { error: up } = await supabase.storage.from("submission-media").upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined });
  if (up) throw up;
  const { data, error } = await supabase.rpc("warmup_declarer", { p_compte: compteId, p_capture: chemin });
  if (error) throw error;
  return data as { ok: boolean; error?: string; deja?: boolean };
}

/** Needs you : la capture, ouverte par un lien signé de 10 min. */
export async function lienCapture(chemin: string): Promise<string> {
  const { data, error } = await supabase.storage.from("submission-media").createSignedUrl(chemin, 600);
  if (error) throw error;
  return data.signedUrl;
}
