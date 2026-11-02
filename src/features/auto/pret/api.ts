import { supabase } from "@/lib/supabase/client";

/** 0487 : un point du bloc « Ready for Monday ». ok : vrai = vert, faux = rouge, null = information. */
export interface PointPret {
  ordre: number;
  groupe: "interrupteurs" | "contrats" | "cohorte" | "samedi" | "lundi" | "needs_you";
  cle: string;
  ok: boolean | null;
  valeur: string;
  attendu: string | null;
  lien: string;
}

export const GROUPES_PRET: readonly PointPret["groupe"][] = ["interrupteurs", "contrats", "cohorte", "samedi", "lundi", "needs_you"];

export async function lirePretLundi(): Promise<PointPret[]> {
  const { data, error } = await supabase.rpc("pret_lundi");
  if (error) throw error;
  return ((data ?? []) as PointPret[]).slice().sort((a, b) => a.ordre - b.ordre);
}

/** Ce qui manque encore (les points rouges). */
export const manquants = (points: readonly PointPret[]) => points.filter((p) => p.ok === false).length;
