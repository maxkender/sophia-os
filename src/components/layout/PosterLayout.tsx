import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, Gift, MessageSquareQuote, Wallet } from "lucide-react";

import { BoutonGuideNotion, GUIDE_NOTION_POSTER } from "@/features/documents/BoutonGuideNotion";
import { lireCohorteAccueil } from "@/features/moteur/api";
import { NudgePopup } from "@/features/moteur/NudgePopup";
import { ReviewPopup } from "@/features/reviews/ReviewPopup";
import { OnboardingPopup } from "@/features/onboarding/OnboardingPopup";
import { AppShell } from "./AppShell";

export function PosterLayout() {
  const { t } = useTranslation();
  // Cohorte Ruul (venus du site) : une page Payments en plus.
  const cohorte = useQuery({ queryKey: ["accueil-cohorte"], queryFn: lireCohorteAccueil, staleTime: Infinity });
  const items = [
    { to: "/calendrier", label: t("nav.calendrier"), icon: CalendarDays },
    ...(cohorte.data?.cohorteRuul ? [{ to: "/createur/paiements", label: t("nav.paiementsRuul"), icon: Wallet }] : []),
    { to: "/createur/retours", label: t("nav.retours"), icon: MessageSquareQuote },
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
