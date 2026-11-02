import * as React from "react";
import { useTranslation } from "react-i18next";

/**
 * Prompt 21, D3 : les anciennes pages Guide / Onboarding / FAQ de l'OS
 * (/manager/guide, /manager/onboarding, /manager/faq, /createur/guide,
 * /createur/faq) renvoient vers le guide Notion (`GUIDE_NOTION_*`), qui les a
 * remplacées le 16/10. Un ancien lien n'aboutit plus sur une page morte.
 */
export function RedirectionGuideNotion({ url }: { url: string }) {
  const { t } = useTranslation();
  React.useEffect(() => {
    window.location.replace(url);
  }, [url]);
  return (
    <p className="p-6 text-sm text-muted-foreground">
      <a href={url} className="underline underline-offset-2">
        {t("documents.voirRegles")}
      </a>
    </p>
  );
}
