// UGC IA : les sources qu'on a refermées pour gagner de la place. Retenu dans
// ce navigateur seulement (confort d'affichage, rien en base) ; sans stockage
// possible (navigation privée…), tout s'ouvre comme avant.

import * as React from "react";

const CLE = "ugc-ia:sources-fermees";

export function lireFermees(): Set<string> {
  try {
    const brut = window.localStorage.getItem(CLE);
    const liste: unknown = brut ? JSON.parse(brut) : [];
    return new Set(Array.isArray(liste) ? liste.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function ecrireFermees(fermees: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify([...fermees]));
  } catch {
    // Stockage indisponible : l'état reste celui de la page ouverte.
  }
}

/** Ne garde que les sources qui existent encore (une source supprimée sort de la liste). */
export function garderExistantes(fermees: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const existantes = new Set(ids);
  return new Set([...fermees].filter((id) => existantes.has(id)));
}

/** Ouvrir / fermer une source, tout ouvrir, tout fermer ; retenu d'une visite à l'autre. */
export function useSourcesFermees(ids: readonly string[] | undefined) {
  const [fermees, setFermees] = React.useState<Set<string>>(lireFermees);
  const changer = React.useCallback((suivant: Set<string>) => {
    setFermees(suivant);
    ecrireFermees(suivant);
  }, []);

  // Les sources supprimées ne restent pas dans la liste retenue.
  const cle = ids?.join("|");
  React.useEffect(() => {
    if (!ids) return;
    setFermees((avant) => {
      const nettoyees = garderExistantes(avant, ids);
      if (nettoyees.size === avant.size) return avant;
      ecrireFermees(nettoyees);
      return nettoyees;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return {
    fermees,
    basculer: (id: string) => {
      const suivant = new Set(fermees);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      changer(suivant);
    },
    toutFermer: () => changer(new Set(ids ?? [])),
    toutOuvrir: () => changer(new Set()),
  };
}
