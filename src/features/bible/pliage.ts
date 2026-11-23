/**
 * 23/11 : dans la Bible, une app (tout son contenu) ou un label se replie et se déplie. Ce qui est replié est retenu
 * dans ce navigateur (d'un onglet à l'autre, d'une visite à l'autre) ; rien n'est écrit en base.
 *
 * Les clés : `app:<section>`, `label:<id du bloc>` (comptes de la Bible), `source:<id du label>` (onglets des sources).
 */
import * as React from "react";

const CLE = "bible:plies";

function lire(): Set<string> {
  try {
    const brut = localStorage.getItem(CLE);
    const v: unknown = brut ? JSON.parse(brut) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function ecrire(s: Set<string>) {
  try {
    localStorage.setItem(CLE, JSON.stringify([...s]));
  } catch {
    // Navigation privée, stockage plein : le repli tient le temps de la page.
  }
}

export interface Pliage {
  estPlie: (cle: string) => boolean;
  basculer: (cle: string) => void;
  /** Replie ces clés (les autres restent comme elles sont). */
  plier: (cles: string[]) => void;
  /** Déplie ces clés ; sans argument, déplie tout. */
  deplier: (cles?: string[]) => void;
}

export function usePliage(): Pliage {
  const [plies, setPlies] = React.useState<Set<string>>(lire);
  const changer = React.useCallback((f: (s: Set<string>) => void) => {
    setPlies((avant) => {
      const s = new Set(avant);
      f(s);
      ecrire(s);
      return s;
    });
  }, []);
  return React.useMemo(() => ({
    estPlie: (cle) => plies.has(cle),
    basculer: (cle) => changer((s) => { if (s.has(cle)) s.delete(cle); else s.add(cle); }),
    plier: (cles) => changer((s) => { for (const c of cles) s.add(c); }),
    deplier: (cles) => changer((s) => { if (!cles) s.clear(); else for (const c of cles) s.delete(c); }),
  }), [plies, changer]);
}
