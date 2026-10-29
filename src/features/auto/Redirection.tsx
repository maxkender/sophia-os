import { Navigate, useLocation } from "react-router-dom";

/** Une ancienne adresse → la nouvelle, en gardant `?…` et `#…` (prompt 22). */
export function Redirection({ vers }: { vers: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${vers}${search}${hash}`} replace />;
}
