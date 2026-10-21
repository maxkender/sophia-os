import * as React from "react";

import { cn } from "@/lib/utils";

import { MICO_SVG } from "./micoSvg";

/**
 * Les huit humeurs que la feuille de style du dessin sait jouer.
 * (Au repos, coucou, joie, dodo, réflexion, surprise, fête, oups.)
 */
export const ETATS_MICO = [
  "idle",
  "wave",
  "happy",
  "sleep",
  "think",
  "surprise",
  "celebrate",
  "sad",
] as const;

export type EtatMico = (typeof ETATS_MICO)[number];

/** Ce que Mico raconte, pour les lecteurs d'écran. */
const LIBELLES: Record<EtatMico, string> = {
  idle: "Mico, the mascot",
  wave: "Mico waves hello",
  happy: "Mico is happy",
  sleep: "Mico is asleep",
  think: "Mico is thinking",
  surprise: "Mico is surprised",
  celebrate: "Mico is celebrating",
  sad: "Mico looks sad",
};

/**
 * Mico, à l'humeur demandée.
 *
 * Le dessin est injecté tel quel : c'est du SVG figé, généré depuis le fichier
 * d'origine (`micoSvg.ts`), jamais de la saisie utilisateur. L'animation vient
 * de la feuille de style embarquée dans le SVG, qui respecte déjà
 * `prefers-reduced-motion`.
 */
export function Mico({
  etat = "idle",
  className,
}: {
  etat?: EtatMico;
  className?: string;
}) {
  const balisage = React.useMemo(
    () => MICO_SVG.replace("__ETAT__", `s-${etat}`).replace("__LABEL__", LIBELLES[etat]),
    [etat],
  );

  return (
    <div
      className={cn("pointer-events-none select-none", className)}
      // SVG figé, généré depuis le fichier livré : jamais de saisie utilisateur.
      dangerouslySetInnerHTML={{ __html: balisage }}
    />
  );
}
