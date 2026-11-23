/**
 * 23/11 : dans la Bible, une app (tout son contenu) ou un label se replie et se déplie. L'état est retenu dans ce
 * navigateur (d'un onglet à l'autre, d'une visite à l'autre) ; rien n'est écrit en base.
 *
 * Les apps sont dépliées par défaut. Les labels sont REPLIÉS par défaut (une ligne chacun) : « Tout déplier » et
 * « Tout replier » changent ce défaut, et chaque clic sur un chevron est une exception à ce défaut.
 *
 * Les clés : `app:<section>`, `label:<id du bloc>` (comptes de la Bible), `source:<clé du label>` (onglets des
 * sources), `podz:<id du bloc>` (podz validés).
 */
import * as React from "react";

const CLE = "bible:pliage";

interface Etat { labelsOuverts: boolean; exceptions: Set<string> }

function lire(): Etat {
  try {
    const brut = localStorage.getItem(CLE);
    const v = (brut ? JSON.parse(brut) : null) as { labelsOuverts?: unknown; exceptions?: unknown } | null;
    return {
      labelsOuverts: v?.labelsOuverts === true,
      exceptions: new Set(Array.isArray(v?.exceptions) ? v.exceptions.filter((x): x is string => typeof x === "string") : []),
    };
  } catch {
    return { labelsOuverts: false, exceptions: new Set() };
  }
}

function ecrire(e: Etat) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ labelsOuverts: e.labelsOuverts, exceptions: [...e.exceptions] }));
  } catch {
    // Navigation privée, stockage plein : le repli tient le temps de la page.
  }
}

export interface Pliage {
  estPlie: (cle: string) => boolean;
  basculer: (cle: string) => void;
  /** Tout déplier : les apps et tous les labels. */
  toutDeplier: () => void;
  /** Tout replier : chaque label sur une ligne (les apps restent dépliées). */
  toutReplier: () => void;
}

export function usePliage(): Pliage {
  const [etat, setEtat] = React.useState<Etat>(lire);
  const poser = React.useCallback((f: (avant: Etat) => Etat) => {
    setEtat((avant) => {
      const apres = f(avant);
      ecrire(apres);
      return apres;
    });
  }, []);
  return React.useMemo(() => ({
    estPlie: (cle) => {
      const exception = etat.exceptions.has(cle);
      return cle.startsWith("app:") || etat.labelsOuverts ? exception : !exception;
    },
    basculer: (cle) => poser((avant) => {
      const exceptions = new Set(avant.exceptions);
      if (exceptions.has(cle)) exceptions.delete(cle); else exceptions.add(cle);
      return { ...avant, exceptions };
    }),
    toutDeplier: () => poser(() => ({ labelsOuverts: true, exceptions: new Set() })),
    toutReplier: () => poser(() => ({ labelsOuverts: false, exceptions: new Set() })),
  }), [etat, poser]);
}
