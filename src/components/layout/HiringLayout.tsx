import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, FilePenLine, Gauge, HelpCircle, Rocket, UserPlus, Users } from "lucide-react";

import { useAuth } from "@/features/auth/AuthContext";
import { AppShell } from "./AppShell";

/**
 * Coquille HM / DM / COS : créer des posters + guides.
 *
 * Le DM a 2 entrées en plus. Le COS, lui, a un second espace (la coquille
 * admin restreinte) et n'a donc qu'un pont vers celui-ci.
 */
export function HiringLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const estDm = role === "directing_manager";
  const estCos = role === "chief_of_staff";

  return (
    <AppShell
      navLabel={estCos ? t("cos.badge") : estDm ? t("hiring.badgeDm") : t("hiring.badgeHm")}
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
        ...(estCos
          ? [
              {
                title: t("cos.autreEspace"),
                items: [
                  {
                    to: "/admin/calendrier",
                    label: t("cos.espaceAdmin"),
                    icon: Gauge,
                    description: t("cos.espaceAdminDesc"),
                  },
                ],
              },
            ]
          : []),
        {
          title: t("documents.rubrique"),
          items: [
            { to: "/manager/guide", label: t("documents.guideManager"), icon: BookOpen },
            { to: "/manager/onboarding", label: t("documents.onboarding"), icon: Rocket },
            { to: "/manager/faq", label: t("documents.faq"), icon: HelpCircle },
          ],
        },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
