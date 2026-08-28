import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { SophiaLogo } from "@/components/brand/SophiaLogo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/layout/FullPageLoader";
import { signOut } from "./api";
import { ChangePasswordPage } from "./ChangePasswordPage";
import { useAuth } from "./AuthContext";

/** Compte existant mais pas encore activé par un admin. */
function EnAttente() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <SophiaLogo />
      <Alert className="max-w-sm text-left">
        <AlertTitle>{t("auth.pendingTitle")}</AlertTitle>
        <AlertDescription>{t("auth.pendingBody")}</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => signOut()}>
        {t("auth.logout")}
      </Button>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, profil, role, loading } = useAuth();

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  // profil null = provisioning encore en cours, on laisse passer le chargement.
  if (profil && !profil.is_active) return <EnAttente />;
  if (!role) return <EnAttente />;

  // Le mot de passe reste celui donné par l'admin, le même pour tous : la
  // création de compte ne lève donc jamais ce drapeau. Le passage est conservé
  // pour qu'un admin puisse forcer un changement sur un compte précis.
  if (profil?.must_change_password) return <ChangePasswordPage />;

  return <Outlet />;
}
