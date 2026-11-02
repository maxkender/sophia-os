import { Navigate, useLocation } from "react-router-dom";

/** Une ancienne adresse → la nouvelle, en gardant `?…` et `#…` (prompt 22). */
export function Redirection({ vers }: { vers: string }) {
  const { search, hash } = useLocation();
  // Une adresse cible qui a déjà ses paramètres (?onglet=…) garde aussi ceux de l'ancienne.
  const suite = search && vers.includes("?") ? `&${search.slice(1)}` : search;
  return <Navigate to={`${vers}${suite}${hash}`} replace />;
}
