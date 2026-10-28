import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";

/** Le bonus de parrainage est-il actif (réglage bonus_parrainage_actif, Payroll → Réglages) ? */
export async function lireParrainageActif(): Promise<boolean> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "bonus_parrainage_actif").maybeSingle();
  if (error) throw error;
  return data?.valeur === true;
}

/**
 * Prompt 15, point 2 : en pause (false), le parrainage est caché partout
 * (menu et accueil du posteur, menu admin ; les routes restent). Caché aussi
 * tant que la lecture n'a pas répondu.
 */
export function useParrainageActif(): boolean {
  const q = useQuery({ queryKey: ["reglages", "parrainage-actif"], queryFn: lireParrainageActif, staleTime: 5 * 60_000 });
  return q.data === true;
}
