import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { listerLabels } from "../api";
import { listerApplicationsMulti, listerLiensLabels } from "../apiMultiApp";
import {
  CHOIX_CREATION_DEFAUT,
  choixApplicationRequis,
  optionsDuChoix,
  validerChoixCreation,
  type ChoixCreation,
  type OptionsChoixCreation,
} from "./choixCreation";
import { CLE_APPLICATIONS_MULTI, CLE_LIENS_LABELS } from "./useMultiApp";

/**
 * État du choix « Application du compte » d'un formulaire de création de
 * compte (admin, Head of Ops, DM, HM). Inactif (compte CM, UGC vidéo,
 * formulaire fermé) : AUCUNE lecture, options vides, jamais bloquant — le
 * formulaire envoie exactement le corps d'avant. Sophia : options vides aussi.
 *
 * Aucune application n'est cochée d'avance : dès qu'il y en a au moins deux
 * actives, le recruteur DOIT cliquer. Le bouton d'envoi reste cliquable ; il
 * appelle `verifier()`, qui affiche « choisis l'application » et refuse
 * l'envoi tant que rien n'est choisi.
 *
 * Mêmes clés de cache que `useApplicationsMulti` / `useLiensLabels` et que la
 * liste des labels de la page Posters : rien de relu en double.
 */
export function useChoixApplicationsCreation(actif: boolean, langue?: string | null) {
  const [choix, setChoix] = React.useState<ChoixCreation>(CHOIX_CREATION_DEFAUT);
  // Envoi tenté sans application : le bloc le signale en rouge.
  const [tente, setTente] = React.useState(false);
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

  const reinitialiser = React.useCallback(() => {
    setChoix(CHOIX_CREATION_DEFAUT);
    setTente(false);
  }, []);
  const options: OptionsChoixCreation = actif ? optionsDuChoix(choix) : {};
  // Choix exigé : au moins deux applications actives, ou catalogue pas encore
  // lu (jamais de choix implicite). Le bloc reste aussi visible quand une
  // application déjà choisie s'est éteinte entre-temps, pour dire pourquoi
  // l'envoi est bloqué.
  const requis = choixApplicationRequis(actif, applications.data);
  const manquant = requis && !choix.application;
  const visible = actif && (requis || choix.application !== null);
  /** À appeler avant d'envoyer : `false` (et message affiché) si rien n'est choisi. */
  const verifier = React.useCallback((): boolean => {
    if (!manquant) return true;
    setTente(true);
    return false;
  }, [manquant]);

  return {
    actif,
    /** Le bloc s'affiche (choix exigé, ou application déjà choisie). */
    visible,
    choix,
    setChoix,
    reinitialiser,
    /** Une application doit être choisie et ne l'est pas encore. */
    manquant,
    /** Envoi tenté sans application : message « choisis l'application ». */
    signalerManquant: tente && manquant,
    verifier,
    validation,
    /** À étaler dans l'appel API : {} pour Sophia (corps d'avant). */
    options,
    /**
     * Bouton à griser (application choisie mais impossible : éteinte, sans
     * label). Rien de choisi ne grise PAS : le clic passe par `verifier()`.
     */
    bloque: actif && !validation.ok,
    applications,
    liens,
    labels,
  };
}

export type EtatChoixApplicationsCreation = ReturnType<typeof useChoixApplicationsCreation>;
