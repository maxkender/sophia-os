import { Navigate, Outlet } from "react-router-dom";

import { useAuth, type Role } from "./AuthContext";
import { ACCUEIL_COS } from "./pagesCos";

const ACCUEIL: Record<Role, string> = {
  admin: "/admin",
  poster: "/calendrier",
  hiring_manager: "/embauche",
  directing_manager: "/embauche",
  chief_of_staff: ACCUEIL_COS,
};

export function RoleGate({ allow }: { allow: Role[] }) {
  const { role } = useAuth();

  if (!role) return <Navigate to="/login" replace />;
  if (!allow.includes(role)) return <Navigate to={ACCUEIL[role]} replace />;

  return <Outlet />;
}
