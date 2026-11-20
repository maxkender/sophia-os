import * as React from "react";

/**
 * Le texte d'une annonce, avec son gras : ce qui est entre `**` sort en gras
 * (20/11, pour qu'une consigne importante se voie). Rien d'autre n'est
 * interprété : pas de HTML, pas de lien. Un `**` sans son double reste du texte.
 */
export function texteAvecGras(texte: string): React.ReactNode[] {
  const morceaux = texte.split("**");
  // Nombre pair de morceaux : un « ** » n'est pas refermé, on ne met rien en gras.
  if (morceaux.length % 2 === 0) return [texte];
  return morceaux.map((m, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold">{m}</strong> : m));
}
