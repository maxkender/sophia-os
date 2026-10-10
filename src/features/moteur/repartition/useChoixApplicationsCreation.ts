import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { listerLabels } from "../api";
import { listerApplicationsMulti, listerLiensLabels } from "../apiMultiApp";
import {
  CHOIX_CREATION_DEFAUT,
  optionsDuChoix,
  validerChoixCreation,
  type ChoixCreation,
  type OptionsChoixCreation,
} from "./choixCreation";
import { CLE_APPLICATIONS_MULTI, CLE_LIENS_LABELS } from "./useMultiApp";

/**
 * État du choix « label + répartition » d'un formulaire de création de compte
 * (admin, Head of Ops, DM, HM). Inactif (compte CM, UGC vidéo, formulaire
 * fermé) : AUCUNE lecture, options vides, jamais bloquant — le formulaire
 * envoie exactement le corps d'avant.
 *
 * Mêmes clés de cache que `useApplicationsMulti` / `useLiensLabels` et que la
 * liste des labels de la page Posters : rien de relu en double.
 */
export function useChoixApplicationsCreation(actif: boolean, langue?: string | null) {
  const [choix, setChoix] = React.useState<ChoixCreation>(CHOIX_CREATION_DEFAUT);
  const applications = useQuery({
    queryKey: CLE_APPLICATIONS_MULTI,
    queryFn: listerApplicationsMulti,
    staleTime: 60_000,
    retry: false,
    enabled: actif,
  });
  const liens = useQuery({
    queryKey: CLE_LIENS_LABELS,
    queryFn: listerLiensLabels,
    staleTime: 60_000,
    retry: false,
    enabled: actif,
  });
  const labels = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
    enabled: actif,
  });

  const validation = React.useMemo(
    () =>
      validerChoixCreation({
        choix,
        applications: applications.data ?? null,
        liens: liens.data ?? null,
        labels: labels.data ?? null,
        langue,
      }),
    [choix, applications.data, liens.data, labels.data, langue],
  );

  const reinitialiser = React.useCallback(() => setChoix(CHOIX_CREATION_DEFAUT), []);
  const options: OptionsChoixCreation = actif ? optionsDuChoix(choix) : {};

  return {
    actif,
    choix,
    setChoix,
    reinitialiser,
    validation,
    /** À étaler dans l'appel API : {} tant que rien n'est choisi. */
    options,
    /** Envoi à bloquer (choix invalide). Toujours faux quand inactif. */
    bloque: actif && !validation.ok,
    applications,
    liens,
    labels,
  };
}

export type EtatChoixApplicationsCreation = ReturnType<typeof useChoixApplicationsCreation>;
