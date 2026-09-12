import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, FileSignature, Gift, HelpCircle } from "lucide-react";

import { NudgePopup } from "@/features/moteur/NudgePopup";
import { ReviewPopup } from "@/features/reviews/ReviewPopup";
import { OnboardingPopup } from "@/features/onboarding/OnboardingPopup";
import { listerContratsPapier } from "@/features/moteur/api";
import { AppShell } from "./AppShell";

export function PosterLayout() {
  const { t } = useTranslation();
  const contrats = useQuery({
    queryKey: ["papier-cm-contrats"],
    queryFn: () => listerContratsPapier(),
  });
  const aContrat = (contrats.data ?? []).length > 0;
  const items = [
    { to: "/calendrier", label: t("nav.calendrier"), icon: CalendarDays },
    { to: "/createur/parrainage", label: t("nav.referral"), icon: Gift },
    ...(aContrat
      ? [{ to: "/createur/contrat-papier", label: t("nav.contratPapier"), icon: FileSignature }]
      : []),
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
