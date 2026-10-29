import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 21, partie D : les cibles de recrutement par pays (0425). La cible
 * se note le samedi (`ckd_recrutement`, carte admin) ; `recrutement_cibles`
 * y ajoute les recrutés et l'écart. L'admin voit tout, une HM ses lignes
 * envoyées.
 */

export interface CibleRecrutement {
  controle_id: string | null;
  cohorte: string;
  pays: string;
  hm_id: string | null;
  cible: number;
  recrutes: number;
  ecart: number;
  envoye_at: string | null;
}

export const CLE_CIBLES = ["recrutement-cibles"] as const;

export async function listerCiblesRecrutement(depuis?: string): Promise<CibleRecrutement[]> {
  const { data, error } = await supabase.rpc("recrutement_cibles", depuis ? { p_depuis: depuis } : {});
  if (error) throw error;
  return ((data ?? []) as CibleRecrutement[]).map((l) => ({
    ...l,
    cible: Number(l.cible ?? 0),
    recrutes: Number(l.recrutes ?? 0),
    ecart: Number(l.ecart ?? 0),
  }));
}
