import { LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

/** 0671 : le bouton « Help » sur toutes les pages du dashboard posteur (sauf sur Help). */
export function BoutonHelp() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (pathname.startsWith("/createur/help")) return null;
  return (
    <Link
      to="/createur/help"
      data-testid="bouton-help"
      className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90"
    >
      <LifeBuoy className="size-4" />
      {t("nav.help")}
    </Link>
  );
}
