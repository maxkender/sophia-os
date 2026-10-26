import { useQuery } from "@tanstack/react-query";

import { aujourdhuiParis } from "@/features/moteur/cohortes";

import { lirePaie } from "./api";
import { semaineAPayer } from "./logique";

/** La paie de la semaine qui vient de finir, pour les posteurs de la HM. */
export function usePaieHm(hmId: string | undefined) {
  const semaine = semaineAPayer(aujourdhuiParis());
  const paie = useQuery({
    queryKey: ["paie", "hm", hmId, semaine],
    enabled: Boolean(hmId),
    // Admin et Head of Ops lisent toutes les lignes : on garde les leurs.
    queryFn: async () => (await lirePaie(semaine)).filter((l) => l.poster?.manager_id === hmId),
  });
  return { semaine, paie };
}
