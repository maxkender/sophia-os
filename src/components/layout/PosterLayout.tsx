import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, Gift, HelpCircle } from "lucide-react";

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
      groups={[
        { items },
        {
          title: t("documents.rubrique"),
          items: [
            { to: "/createur/guide", label: t("documents.guideCreateur"), icon: BookOpen },
            { to: "/createur/faq", label: t("documents.faq"), icon: HelpCircle },
          ],
        },
      ]}
    >
      <OnboardingPopup />
      <ReviewPopup />
      <NudgePopup />
      <Outlet />
    </AppShell>
  );
}
