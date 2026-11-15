import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

/**
 * 13/11 (Max) : en haut de toutes les pages du dashboard posteur, le bouton rouge
 * « 💬 Question or problem? Ask here » qui ouvre Help (sauf sur Help).
 */
export function BoutonHelp() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (pathname.startsWith("/createur/help")) return null;
  return (
    <div className="mb-3 flex justify-end">
      <Link
        to="/createur/help"
        data-testid="bouton-help"
        className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 font-semibold text-sm text-white shadow-sm hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        {t("support.help.boutonHaut")}
      </Link>
    </div>
  );
}
