import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, FilePenLine, Gauge, UserPlus, Users } from "lucide-react";

import { useAuth } from "@/features/auth/AuthContext";
import { BoutonGuideNotion, GUIDE_NOTION_HM } from "@/features/documents/BoutonGuideNotion";
import { AppShell } from "./AppShell";

/**
 * Coquille HM / DM / HO : créer des posters ; le guide est sur Notion (bouton).
 *
 * Le DM a 2 entrées en plus. Le Head of Ops, lui, a un second espace (la coquille
 * admin restreinte) et n'a donc qu'un pont vers celui-ci.
 */
export function HiringLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const estDm = role === "directing_manager";
  const estHo = role === "head_of_ops";

  return (
    <AppShell
      navLabel={estHo ? t("headOfOps.badge") : estDm ? t("hiring.badgeDm") : t("hiring.badgeHm")}
      groups={[
        {
          items: [
            {
              to: "/embauche",
              label: t("nav.embauche"),
              icon: UserPlus,
              description: t("navDesc.embauche"),
            },
            {
              to: "/manager/calendrier",
              label: t("hiring.calendrierNav"),
              icon: CalendarDays,
              description: t("hiring.calendrierSous"),
            },
            ...(estDm
              ? [
                  {
                    to: "/manager/recruteurs",
                    label: t("hiring.suiviHm"),
                    icon: Users,
                    description: t("hiring.suiviHmDesc"),
                  },
                  {
                    to: "/manager/documents",
                    label: t("hiring.docsOnboarding"),
                    icon: FilePenLine,
                    description: t("hiring.docsOnboardingDesc"),
                  },
                ]
              : []),
          ],
        },
        ...(estHo
          ? [
              {
                title: t("headOfOps.autreEspace"),
                items: [
                  {
                    to: "/admin/calendrier",
                    label: t("headOfOps.espaceAdmin"),
                    icon: Gauge,
                    description: t("headOfOps.espaceAdminDesc"),
                  },
                ],
              },
            ]
          : []),
      ]}
      sidebarExtra={
        <BoutonGuideNotion url={GUIDE_NOTION_HM} titre={t("documents.voirRegles")} sousTitre={t("documents.guideNotionHm")} />
      }
    >
      <Outlet />
    </AppShell>
  );
}
