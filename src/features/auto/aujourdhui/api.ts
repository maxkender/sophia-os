import { supabase } from "@/lib/supabase/client";

/** 12/11 (OS clair, 0677) : les chiffres de la page « Aujourd'hui ». */
export interface ChiffresAujourdhui {
  pour_max: number;
  pour_adrien: number;
  ruul_a_inviter: number;
}

export async function lireAujourdhui(): Promise<ChiffresAujourdhui> {
  const { data, error } = await supabase.rpc("os_aujourdhui");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<ChiffresAujourdhui>;
  return { pour_max: Number(d.pour_max ?? 0), pour_adrien: Number(d.pour_adrien ?? 0), ruul_a_inviter: Number(d.ruul_a_inviter ?? 0) };
}
