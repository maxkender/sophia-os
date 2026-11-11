import * as React from "react";
import { PageSure } from "@/components/erreurs/PageSure";
import { SectionSure } from "@/components/erreurs/SectionSure";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, CircleHelp, Gift, Languages, MessageSquareQuote, Wallet } from "lucide-react";

import { BoutonGuideNotion, GUIDE_NOTION_POSTER } from "@/features/documents/BoutonGuideNotion";
import { lireCohorteAccueil } from "@/features/moteur/api";
import { NudgePopup } from "@/features/moteur/NudgePopup";
import { PopupMessagesPosteur } from "@/features/messagesPosteurs/PopupMessagesPosteur";
import { AnnoncesPopup } from "@/features/annonces/AnnoncesPopup";
import { DebutPopup } from "@/features/annonces/DebutPopup";
import { ReviewPopup } from "@/features/reviews/ReviewPopup";
import { OnboardingPopup } from "@/features/onboarding/OnboardingPopup";
import { useEspaceRelecteur } from "@/features/relectureNative/useEspaceRelecteur";
import { AppShell } from "./AppShell";
import { useParrainageActif } from "@/features/bonus/parrainageActif";
import { useAuth } from "@/features/auth/AuthContext";
import { BandeauEmailRuul } from "@/features/ruul/BandeauEmailRuul";

export function PosterLayout() {
  const { t, i18n } = useTranslation();
  const { roleReel } = useAuth();
  // Prompt 15, point 6d : l'interface du posteur est toujours en anglais.
  React.useEffect(() => {
    if (roleReel === "poster" && i18n.resolvedLanguage !== "en") void i18n.changeLanguage("en");
  }, [i18n, i18n.resolvedLanguage, roleReel]);
  // Cohorte Ruul (venus du site) : une page Payments en plus.
  const cohorte = useQuery({ queryKey: ["accueil-cohorte"], queryFn: lireCohorteAccueil, staleTime: Infinity });
  // Relecteur natif désigné, espace ouvert par l'admin : un onglet en plus.
  const espaceRelecteur = useEspaceRelecteur();
  const parrainage = useParrainageActif();
  const items = [
    { to: "/calendrier", label: t("nav.calendrier"), icon: CalendarDays },
    ...(cohorte.data?.cohorteRuul ? [{ to: "/createur/paiements", label: t("nav.paiementsRuul"), icon: Wallet }] : []),
    { to: "/createur/retours", label: t("nav.retours"), icon: MessageSquareQuote },
    // 6/11 : les réponses officielles validées par Max.
    { to: "/createur/faq", label: t("nav.faqPosteur"), icon: CircleHelp },
    ...(espaceRelecteur.relecteurs.length > 0
      ? [{ to: "/createur/relecture", label: t("nav.relectureNativePoster"), icon: Languages }]
      : []),
    // Prompt 15, point 2 : caché tant que le bonus de parrainage est en pause.
    ...(parrainage ? [{ to: "/createur/parrainage", label: t("nav.parrainerAmi"), icon: Gift }] : []),
  ];
  return (
    <AppShell
      navLabel={t("nav.poster")}
      groups={[{ items }]}
      sidebarExtra={
        <BoutonGuideNotion url={GUIDE_NOTION_POSTER} titre={t("documents.voirRegles")} sousTitre={t("documents.guideNotionPoster")} />
      }
    >
      {/* 10/11 : posteur Ruul sans email Ruul, en haut de l'espace. */}
      <BandeauEmailRuul />
      {/*
        11/11 : chaque pop-up dans sa SectionSure. Ils s'ouvrent par-dessus le
        calendrier et ne se ferment que par leur bouton : un pop-up qui plantait
        démontait toute l'app (page blanche, calendrier inaccessible, Leidy les
        4, 7 et 11/11). Il ne reste plus à sa place que le message d'erreur, la
        page se voit dessous.
      */}
      <SectionSure nom="Welcome">
        <OnboardingPopup />
      </SectionSure>
      <SectionSure nom="Feedback">
        <ReviewPopup />
      </SectionSure>
      <SectionSure nom="Reminder">
        <NudgePopup />
      </SectionSure>
      <SectionSure nom="Messages">
        <PopupMessagesPosteur />
      </SectionSure>
      <SectionSure nom="Announcements">
        <AnnoncesPopup />
      </SectionSure>
      <SectionSure nom="Getting started">
        <DebutPopup />
      </SectionSure>
      <PageSure />
    </AppShell>
  );
}
