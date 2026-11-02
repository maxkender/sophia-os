import { useQuery } from "@tanstack/react-query";

import { lireReglageRelecture, mesRelecteurs } from "./api";
import { relecteursAvecEspace } from "./logique";

export const CLE_REQUETE_MES_RELECTEURS = ["mes-relecteurs"] as const;
export const CLE_REQUETE_REGLAGE_POSTER = ["relecture-native-reglage-poster"] as const;

/**
 * Les langues pour lesquelles le posteur connecté est relecteur ET dont
 * l'espace est ouvert. Vide pour presque tous les posteurs : l'onglet ne
 * s'affiche pas.
 */
export function useEspaceRelecteur() {
  const relecteurs = useQuery({
    queryKey: CLE_REQUETE_MES_RELECTEURS,
    queryFn: mesRelecteurs,
    staleTime: 5 * 60_000,
  });
  const reglage = useQuery({
    queryKey: CLE_REQUETE_REGLAGE_POSTER,
    queryFn: lireReglageRelecture,
    staleTime: 5 * 60_000,
  });
  const ouverts = relecteursAvecEspace(relecteurs.data ?? [], reglage.data?.espace_ouvert === true);
  return {
    relecteurs: ouverts,
    isPending: relecteurs.isPending || reglage.isPending,
    error: relecteurs.error ?? reglage.error,
  };
}
