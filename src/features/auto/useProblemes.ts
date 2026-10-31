import { useQuery } from "@tanstack/react-query";

import { lireEtatFrequences } from "@/features/frequences/api";

import { lireSante } from "./api";
import { CLE_PAUSE } from "./clesPause";
import { lireFreins } from "./freinsApi";
import { lireEtatPause } from "./pauseApi";
import { detecterProblemes } from "./problemes";

/** Les problèmes graves de l'automatisation (lus toutes les 2 minutes). */
export function useProblemes(actif = true) {
  const intervalle = 2 * 60_000;
  const sante = useQuery({ queryKey: ["auto", "sante"], queryFn: lireSante, refetchInterval: intervalle, enabled: actif });
  const frequences = useQuery({ queryKey: ["frequences-upwork"], queryFn: lireEtatFrequences, refetchInterval: intervalle, enabled: actif });
  const freins = useQuery({ queryKey: ["freins-envoi"], queryFn: lireFreins, refetchInterval: intervalle, enabled: actif });
  const pause = useQuery({ queryKey: CLE_PAUSE, queryFn: lireEtatPause, refetchInterval: intervalle, enabled: actif });
  const erreur = sante.error ?? frequences.error ?? freins.error ?? pause.error;
  return {
    problemes: detecterProblemes({ sante: sante.data, frequences: frequences.data, freins: freins.data, pause: pause.data }),
    charge: !sante.isPending && !frequences.isPending,
    erreur: erreur as Error | null,
  };
}

