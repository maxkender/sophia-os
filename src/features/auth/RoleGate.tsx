import { Navigate, Outlet } from "react-router-dom";

import { useAuth, type Role } from "./AuthContext";
import { ACCUEIL_ADMIN } from "@/features/auto/pages";

import { ACCUEIL_HO } from "./pagesHeadOfOps";

const ACCUEIL: Record<Role, string> = {
  admin: ACCUEIL_ADMIN,
  poster: "/calendrier",
  hiring_manager: "/embauche",
  directing_manager: "/embauche",
  head_of_ops: ACCUEIL_HO,
};

export function RoleGate({ allow }: { allow: Role[] }) {
  const { role } = useAuth();

  if (!role) return <Navigate to="/login" replace />;
  if (!allow.includes(role)) return <Navigate to={ACCUEIL[role]} replace />;

  return <Outlet />;
}
