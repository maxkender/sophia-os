import { useQuery } from "@tanstack/react-query";

import { listerApplicationsMulti, listerLiensLabels } from "../apiMultiApp";

/**
 * Lectures partagées des écrans multi-app (clés communes : Pilotage peut les
 * invalider après un cochage de label). `retry: false` : avant la migration
 * 0256, `label_applications` n'existe pas — on affiche l'erreur localement tout
 * de suite plutôt que de réessayer trois fois une table absente.
 */
export const CLE_APPLICATIONS_MULTI = ["applications-multi"] as const;
export const CLE_LIENS_LABELS = ["label-applications"] as const;

export function useApplicationsMulti() {
  return useQuery({
    queryKey: CLE_APPLICATIONS_MULTI,
    queryFn: listerApplicationsMulti,
    staleTime: 60_000,
    retry: false,
  });
}

export function useLiensLabels() {
  return useQuery({
    queryKey: CLE_LIENS_LABELS,
    queryFn: listerLiensLabels,
    staleTime: 60_000,
    retry: false,
  });
}
