import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ecrireReglages, lireReglagesBruts } from "./api";

/** Lire des réglages et les enregistrer d'un coup ; le journal est relu après. */
export function useReglages(cles: readonly string[]) {
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "os", ...cles], queryFn: () => lireReglagesBruts(cles) });
  const enregistrer = useMutation({
    mutationFn: (valeurs: Record<string, unknown>) => ecrireReglages(valeurs),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reglages"] });
      void qc.invalidateQueries({ queryKey: ["reglages-journal"] });
    },
  });
  return { lu, enregistrer };
}
