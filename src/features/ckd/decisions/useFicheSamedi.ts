import { useQuery } from "@tanstack/react-query";

import { lireFicheSamedi } from "./semaineComptes";

/** Prompt 26 : la fiche du samedi d'un posteur (montant en jeu, posts, messages…). */
export function useFicheSamedi(posterId: string, lundi: string, actif: boolean) {
  return useQuery({ queryKey: ["samedi-fiche", posterId, lundi], queryFn: () => lireFicheSamedi(posterId, lundi), enabled: actif, staleTime: 60_000 });
}
