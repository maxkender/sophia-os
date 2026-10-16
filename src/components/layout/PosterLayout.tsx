import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, Gift } from "lucide-react";

import { BoutonGuideNotion, GUIDE_NOTION_POSTER } from "@/features/documents/BoutonGuideNotion";
import { NudgePopup } from "@/features/moteur/NudgePopup";
import { ReviewPopup } from "@/features/reviews/ReviewPopup";
import { OnboardingPopup } from "@/features/onboarding/OnboardingPopup";
import { AppShell } from "./AppShell";

export function PosterLayout() {
  const { t } = useTranslation();
  const items = [
    { to: "/calendrier", label: t("nav.calendrier"), icon: CalendarDays },
    { to: "/createur/parrainage", label: t("nav.referral"), icon: Gift },
  ];
  return (
    <AppShell
      navLabel={t("nav.poster")}
      groups={[{ items }]}
      sidebarExtra={
        <BoutonGuideNotion url={GUIDE_NOTION_POSTER} titre={t("documents.voirRegles")} sousTitre={t("documents.guideNotionPoster")} />
      }
    >
      <OnboardingPopup />
      <ReviewPopup />
      <NudgePopup />
      <Outlet />
    </AppShell>
  );
}
