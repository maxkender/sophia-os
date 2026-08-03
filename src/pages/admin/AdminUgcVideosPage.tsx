import { useTranslation } from "react-i18next";

export function AdminUgcVideosPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight">{t("ugc.videos.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("ugc.videos.bientot")}</p>
    </div>
  );
}
