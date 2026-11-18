/** 18/11 : toutes les lectures de la page Bible, partagées (cache react-query). */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { lireApps, lireFiches, lireImportes, lireLabels, lireNoms, lireProposes } from "./api";

export const CLE_BIBLE = ["bible"] as const;

export function useBible() {
  const fiches = useQuery({ queryKey: [...CLE_BIBLE, "fiches"], queryFn: lireFiches });
  const importes = useQuery({ queryKey: [...CLE_BIBLE, "importes"], queryFn: lireImportes });
  const apps = useQuery({ queryKey: [...CLE_BIBLE, "apps"], queryFn: lireApps });
  const labels = useQuery({ queryKey: [...CLE_BIBLE, "labels"], queryFn: lireLabels });
  const proposes = useQuery({ queryKey: [...CLE_BIBLE, "proposes"], queryFn: lireProposes });
  const ids = (fiches.data ?? []).map((f) => f.ajoute_par ?? "").filter(Boolean);
  const noms = useQuery({ queryKey: [...CLE_BIBLE, "noms", [...new Set(ids)].sort().join(",")], queryFn: () => lireNoms(ids), enabled: fiches.isSuccess });
  return {
    fiches: fiches.data ?? [],
    importes: importes.data ?? [],
    apps: apps.data ?? [],
    labels: labels.data ?? [],
    proposes: proposes.data ?? [],
    noms: noms.data ?? {},
    chargement: fiches.isLoading || importes.isLoading || apps.isLoading || labels.isLoading,
    erreur: (fiches.error ?? importes.error ?? apps.error ?? labels.error ?? proposes.error) as Error | null,
  };
}

export function useRafraichirBible() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CLE_BIBLE });
}

/** Les apps en attente de création déjà utilisées (pour les proposer et les reconnaître dans l'ajout en masse). */
export function appsAttenteConnues(fiches: { apps_attente: string[] }[], proposes: { apps_attente: string[] }[]): string[] {
  return [...new Set([...fiches.flatMap((f) => f.apps_attente ?? []), ...proposes.flatMap((p) => p.apps_attente ?? [])])].sort();
}
