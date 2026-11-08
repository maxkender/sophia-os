import { supabase } from "@/lib/supabase/client";

/** 0566 : par Comment Master, les commentaires retrouvés publiés, le bonus et le délai alerte → commentaire. */
export interface DelaiCm {
  cm_profile_id: string;
  nom: string;
  retrouves: number;
  zone: string | null;
  tarif: number | null;
  montant: number;
  mesures: number;
  delai_median_min: number | null;
  part_moins_2h: number | null;
}

/** Le délai n'est enregistré que pour les alertes envoyées à partir du 9/11. */
export const DEBUT_DELAIS_CM = "2026-11-09";

export async function lireDelaisCm(debut: string, fin: string): Promise<DelaiCm[]> {
  const { data, error } = await supabase.rpc("cm_delais", { p_debut: debut, p_fin: fin });
  if (error) throw new Error(error.message);
  return (data ?? []) as DelaiCm[];
}

/** « 1 h 05 », « 45 min ». */
export function dureeLisible(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
