import * as React from "react";

/**
 * Largeur réelle d'un conteneur, suivie au redimensionnement. Les graphiques
 * dessinent en pixels réels plutôt que d'étirer un viewBox fixe : sinon le
 * texte grossit avec l'écran et le dessin se centre en laissant des marges vides.
 */
export function useLargeur<T extends HTMLElement>(defaut = 640) {
  const ref = React.useRef<T>(null);
  const [largeur, setLargeur] = React.useState(defaut);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setLargeur(Math.round(w));
    };
    mesurer();
    // jsdom (tests) n'a pas de ResizeObserver : on garde la mesure initiale.
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, largeur] as const;
}
