import { supabase } from "@/lib/supabase/client";

/** 12/11 (OS clair, 0677) : les chiffres de la page « Aujourd'hui ». */
export interface ChiffresAujourdhui {
  pour_max: number;
  pour_adrien: number;
  ruul_a_inviter: number;
  /** 0678 : seulement pays introuvable ou fermé (la règle tranche le reste). */
  contrats_a_relier: number;
  /** 0681 : heures depuis le dernier import des statuts Ruul (null : jamais). */
  ruul_import_heures: number | null;
}

export async function lireAujourdhui(): Promise<ChiffresAujourdhui> {
  const { data, error } = await supabase.rpc("os_aujourdhui");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<ChiffresAujourdhui>;
  return { pour_max: Number(d.pour_max ?? 0), pour_adrien: Number(d.pour_adrien ?? 0), ruul_a_inviter: Number(d.ruul_a_inviter ?? 0), contrats_a_relier: Number(d.contrats_a_relier ?? 0),
    ruul_import_heures: d.ruul_import_heures === null || d.ruul_import_heures === undefined ? null : Number(d.ruul_import_heures) };
}
