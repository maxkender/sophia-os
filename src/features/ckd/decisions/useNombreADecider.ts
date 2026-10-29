import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { lireADecider } from "./api";
import { groupe, type Groupe } from "./logique";

/** Le nombre de comptes qui attendent un clic, par groupe (compteurs des onglets). */
export function useNombreADecider(groupes: readonly Groupe[]): number | undefined {
  const liste = useQuery({ queryKey: ["ckd", "a-decider"], queryFn: lireADecider });
  return React.useMemo(
    () => (liste.data ? liste.data.filter((p) => groupes.includes(groupe(p))).length : undefined),
    [liste.data, groupes],
  );
}
