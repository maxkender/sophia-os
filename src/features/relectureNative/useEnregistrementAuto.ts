import * as React from "react";

/** Délai sans frappe avant d'enregistrer, en millisecondes. */
export const DELAI_ENREGISTREMENT = 1200;

/**
 * Enregistrement continu d'un champ : on enregistre dès que la personne
 * s'arrête de taper, et tout de suite quand elle quitte le champ, change de
 * bloc (le champ disparaît) ou ferme la page. Rien n'est envoyé deux fois :
 * une valeur déjà partie ne repart pas.
 *
 * Renvoie la fonction à appeler en quittant le champ (`onBlur`).
 */
export function useEnregistrementAuto(
  valeur: string,
  valeurEnregistree: string,
  enregistrer: (valeur: string) => void,
  delai = DELAI_ENREGISTREMENT,
): () => void {
  const courant = React.useRef({ valeur, valeurEnregistree, enregistrer });
  courant.current = { valeur, valeurEnregistree, enregistrer };
  const envoyee = React.useRef<string | null>(null);

  const vider = React.useCallback(() => {
    const { valeur: v, valeurEnregistree: e, enregistrer: f } = courant.current;
    if (v === e || v === envoyee.current) return;
    envoyee.current = v;
    f(v);
  }, []);

  React.useEffect(() => {
    if (valeur === valeurEnregistree) return;
    const minuteur = window.setTimeout(vider, delai);
    return () => window.clearTimeout(minuteur);
  }, [valeur, valeurEnregistree, delai, vider]);

  React.useEffect(() => {
    window.addEventListener("pagehide", vider);
    return () => {
      window.removeEventListener("pagehide", vider);
      vider();
    };
  }, [vider]);

  return vider;
}
