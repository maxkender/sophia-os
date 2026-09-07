import { useQuery } from "@tanstack/react-query";

import {
  chargerFichesCreateurs,
  chargerStatsCreateurs,
  dernierRunRecrutement,
  listerCreateursRecrutement,
  listerHmsRecrutement,
  listerSuggestionsRecrutement,
} from "./api";

export function useRecrutements() {
  const hms = useQuery({ queryKey: ["recrutements", "hms"], queryFn: listerHmsRecrutement });
  const createurs = useQuery({
    queryKey: ["recrutements", "createurs"],
    queryFn: listerCreateursRecrutement,
  });
  const suggestions = useQuery({
    queryKey: ["recrutements", "suggestions"],
    queryFn: () => listerSuggestionsRecrutement(),
  });
  const run = useQuery({ queryKey: ["recrutements", "run"], queryFn: dernierRunRecrutement });
  const stats = useQuery({
    queryKey: ["recrutements", "stats", (createurs.data ?? []).map((c) => c.id).join("|")],
    queryFn: () => chargerStatsCreateurs(createurs.data ?? []),
    enabled: (createurs.data?.length ?? 0) > 0,
  });
  const fiches = useQuery({
    queryKey: ["recrutements", "fiches", (createurs.data ?? []).map((c) => c.id).join("|")],
    queryFn: () => chargerFichesCreateurs(createurs.data ?? []),
    enabled: (createurs.data?.length ?? 0) > 0,
  });

  return {
    hms: hms.data ?? [],
    createurs: createurs.data ?? [],
    suggestions: suggestions.data ?? [],
    run: run.data ?? null,
    stats: stats.data ?? new Map(),
    fiches: fiches.data ?? new Map(),
    statsPending: (createurs.data?.length ?? 0) > 0 && stats.isPending,
    isPending: hms.isPending || createurs.isPending,
    error: hms.error ?? createurs.error ?? suggestions.error ?? stats.error,
  };
}
