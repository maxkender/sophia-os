import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import type { EvaluationCompte, Signal } from "./statutCompte";

/** Le @ des liens, « Ask for @ », le @ corrigé et le Kill du jeudi, par compte. */
export interface EtatHandle {
  compte_id: string;
  autre_handle: string | null;
  autre_liens: number | null;
  demande_at: string | null;
  repondu_at: string | null;
  handle_avant: string | null;
  handle_apres: string | null;
  corrige: string | null;
  corrige_at: string | null;
  kill_jeudi_at: string | null;
  kill_jeudi_phrase: string | null;
}

export async function lireEtatsHandle(lundi: string, comptes: readonly string[]): Promise<Map<string, EtatHandle>> {
  if (comptes.length === 0) return new Map();
  const { data, error } = await supabase.rpc("handles_etat", { p_lundi: lundi, p_comptes: [...new Set(comptes)] });
  if (error) throw error;
  return new Map(((data ?? []) as EtatHandle[]).map((e) => [e.compte_id, e]));
}

/** « Use @x » : le @ des liens devient celui du compte (lu sur TikTok d'abord). */
export async function utiliserHandle(compteId: string, handle: string): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("ckd", { action: "handle_utiliser", compte_id: compteId, handle });
  if (!r.ok) throw new Error(r.error ?? "échec");
}

/** « Ask for @ » : une fenêtre bloquante sur le dashboard du posteur ; rien ne part. */
export async function demanderHandle(compteId: string): Promise<void> {
  const { error } = await supabase.rpc("handle_demander", { p_compte: compteId });
  if (error) throw error;
}

/** Jeudi : « Kill Saturday » (marquer) ou une autre décision (annuler). Rien ne part. */
export async function marquerKillSamedi(compteId: string, lundi: string, phrase: string, marquer: boolean): Promise<void> {
  const { error } = await supabase.rpc("jeudi_kill_marquer", { p_compte: compteId, p_lundi: lundi, p_phrase: phrase, p_marquer: marquer });
  if (error) throw error;
}

/** La phrase du statut (comme la colonne Status), pour la note « Marked for Kill on Thursday ». */
export function phraseStatut(e: EvaluationCompte, t: (k: string, o?: Record<string, unknown>) => string): string {
  const P = "autoOnglets.decisions.liste.statut";
  const une = (s: Signal) => (s.cle === "zero_post" ? t(`${P}.signaux.zero_post_${s.valeurs?.nudge ?? "non"}`) : t(`${P}.signaux.${s.cle}`, s.valeurs ?? {}));
  return e.signaux.length ? e.signaux.map(une).join(" · ") : t(`${P}.rien`);
}
