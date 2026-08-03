import { useTranslation } from "react-i18next";

export function AdminUgcSlideshowsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight">{t("ugc.slideshows.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("ugc.slideshows.bientot")}</p>
    </div>
  );
}
