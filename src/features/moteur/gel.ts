import { supabase } from "@/lib/supabase/client";

/**
 * 0793 : les comptes du posteur connecté dont l'application est gelée (pas
 * encore lancée, décision de l'admin). Ils ne reçoivent aucun post, restent en
 * warm-up prolongé et sont payés. Ne lève jamais : sans réponse, aucun compte
 * gelé, et le dashboard reste celui d'avant.
 */
export async function lireMesComptesGeles(): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("mes_comptes_geles");
    if (error) return [];
    return ((data ?? []) as { compte_id: string }[]).map((l) => l.compte_id);
  } catch {
    return [];
  }
}
