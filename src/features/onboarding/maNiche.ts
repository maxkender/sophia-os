import { useQuery } from "@tanstack/react-query";

import { mesComptes } from "@/features/moteur/api";
import { comptePrincipal } from "@/features/moteur/comptesCm";
import { nicheDesLabels } from "@/features/moteur/themeLabel";
import { supabase } from "@/lib/supabase/client";

/**
 * 19/11 : la niche du warm-up d'un compte du posteur, d'après son label (il
 * voit les labels de ses comptes, pas ceux des autres). Ne lève jamais : sans
 * label lisible, null, et l'accueil dit « your niche » sans la nommer.
 */
export async function lireMaNiche(compteId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("compte_labels").select("labels(nom, slug)").eq("compte_id", compteId);
    if (error) return null;
    const noms = ((data ?? []) as unknown as { labels: { nom: string | null; slug: string | null } | null }[])
      .map((l) => l.labels?.nom ?? l.labels?.slug ?? null)
      .filter((n): n is string => Boolean(n));
    return noms.length > 0 ? nicheDesLabels(noms) : null;
  } catch {
    return null;
  }
}

/**
 * La niche d'un compte du posteur, pour les textes de son warm-up : l'accueil,
 * l'étape 4 du dashboard, la checklist du 1er post. Inconnue ou pas encore
 * lue : null, et le texte reste « your niche », sans en nommer une.
 */
export function useMaNiche(compteId: string | null | undefined, actif = true): string | null {
  const q = useQuery({
    queryKey: ["ma-niche", compteId ?? null],
    queryFn: () => lireMaNiche(compteId!),
    enabled: actif && Boolean(compteId),
    staleTime: Infinity,
  });
  return q.data ?? null;
}

/** Celle de son compte principal : son 1er compte perso, celui du @ à créer. */
export function useNicheComptePrincipal(actif = true): string | null {
  const comptes = useQuery({ queryKey: ["mes-comptes"], queryFn: () => mesComptes(), enabled: actif });
  return useMaNiche(comptePrincipal(comptes.data ?? [])?.id, actif);
}
