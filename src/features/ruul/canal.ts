import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { supabase } from "@/lib/supabase/client";

/**
 * Parcours Ruul, point 8 : Décisions séparées Upwork | Ruul. Les IDs des posteurs
 * payés par Ruul (profiles.canal_paie = 'ruul'), pour séparer les listes.
 */
export async function lireIdsRuul(): Promise<Set<string>> {
  const { data, error } = await supabase.from("profiles").select("id").eq("canal_paie", "ruul");
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}

export function useIdsRuul(): Set<string> {
  const q = useQuery({ queryKey: ["ids-ruul"], queryFn: lireIdsRuul, staleTime: 60_000 });
  return q.data ?? VIDE;
}
const VIDE = new Set<string>();

export type Plateforme = "upwork" | "ruul";
export const plateformeDe = (ids: Set<string>, posterId: string | null | undefined): Plateforme =>
  posterId && ids.has(posterId) ? "ruul" : "upwork";

/** La plateforme choisie en haut de Décisions (null : toutes, hors de la page Décisions). */
export const PlateformeDecisions = React.createContext<Plateforme | null>(null);
export const usePlateformeDecisions = () => React.useContext(PlateformeDecisions);
