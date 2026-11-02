import { supabase } from "@/lib/supabase/client";

import type { ReglagesBonus } from "../commentMasters/suivi/api";

export { lireReglagesBonus, type ReglagesBonus } from "../commentMasters/suivi/api";

/** Les bonus, payés toutes les 4 semaines (0374). */
export type TypeBonus = "parrainage" | "comment_master";
/** À payer, À voir (pas de lien de contrat Upwork), Payé. */
export type StatutBonus = "a_payer" | "a_voir" | "paye";

export interface LigneBonus {
  id: string;
  poster_id: string;
  hm_id: string | null;
  type: TypeBonus;
  referral_id: string | null;
  recrue_id: string | null;
  lundi_bonus: string;
  periode_debut: string;
  periode_fin: string;
  detail: string;
  quantite: number;
  verifies: number | null;
  montant: number;
  statut: StatutBonus;
  contrat_url: string | null;
  paye_at: string | null;
  paye_par: string | null;
}

export async function lireBonus(lundi: string): Promise<LigneBonus[]> {
  const { data, error } = await supabase.rpc("bonus_lister", { p_lundi: lundi });
  if (error) throw error;
  return ((data ?? []) as LigneBonus[]).map((l) => ({ ...l, montant: Number(l.montant) }));
}

export async function marquerBonusPaye(id: string, paye: boolean): Promise<void> {
  const { error } = await supabase.rpc("bonus_marquer_paye", { p_id: id, p_paye: paye });
  if (error) throw error;
}

/** Calcule (ou recalcule) les bonus d'un lundi bonus ; ne touche jamais une ligne payée. */
export async function genererBonus(lundi: string): Promise<number> {
  const { data, error } = await supabase.rpc("bonus_generer", { p_lundi: lundi });
  if (error) throw error;
  return Number(data ?? 0);
}

export interface BonusAVenir {
  poster_id: string;
  hm_id: string | null;
  type: TypeBonus;
  detail: string;
  quantite: number;
  montant: number;
  lundi_bonus: string;
  /** genere : ligne créée, pas encore payée ; apercu : estimation de la période en cours. */
  etat: "genere" | "apercu";
}

export async function lireBonusAVenir(): Promise<BonusAVenir[]> {
  const { data, error } = await supabase.rpc("bonus_a_venir");
  if (error) throw error;
  return ((data ?? []) as BonusAVenir[]).map((b) => ({ ...b, montant: Number(b.montant) }));
}

export async function enregistrerReglagesBonus(r: ReglagesBonus): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "bonus", valeur: r, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Le parrainage accepté relié à son posteur (la recrue), pour le bonus. */
export async function lierRecrue(referralId: string, recrueId: string | null): Promise<void> {
  const { error } = await supabase
    .from("creator_referrals")
    .update({ recrue_id: recrueId, updated_at: new Date().toISOString() })
    .eq("id", referralId);
  if (error) throw error;
}
