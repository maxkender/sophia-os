import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Clapperboard,
  FlaskConical,
  Gauge,
  Images,
  ListOrdered,
  MessageSquareQuote,
  MoonStar,
  Settings,
  UserRound,
  Users,
  Video,
  Wand2,
} from "lucide-react";

import { AppShell } from "./AppShell";

export function AdminLayout() {
  const { t } = useTranslation();
  return (
    <AppShell
      navLabel={t("nav.admin")}
      groups={[
        {
          items: [
            { to: "/admin", label: t("nav.pilotage"), icon: Gauge, description: t("navDesc.pilotage") },
          ],
        },
        {
          title: t("navSection.production"),
          items: [
            {
              to: "/admin/calendrier",
              label: t("nav.calendrier"),
              icon: CalendarDays,
              description: t("navDesc.calendrier"),
            },
            {
              to: "/admin/minuit",
              label: t("nav.minuit"),
              icon: MoonStar,
              description: t("navDesc.minuit"),
            },
            {
              to: "/admin/slideshows",
              label: t("nav.slideshows"),
              icon: ListOrdered,
              description: t("navDesc.slideshows"),
            },
            {
              to: "/admin/bibliotheque",
              label: t("nav.bibliotheque"),
              icon: Images,
              description: t("navDesc.bibliotheque"),
            },
          ],
        },
        {
          title: t("navSection.ugc"),
          items: [
            {
              to: "/admin/ugc/personas",
              label: t("nav.ugcPersonas"),
              icon: UserRound,
              description: t("navDesc.ugcPersonas"),
            },
            {
              to: "/admin/ugc/slideshows",
              label: t("nav.ugcSlideshows"),
              icon: Clapperboard,
              description: t("navDesc.ugcSlideshows"),
            },
            {
              to: "/admin/ugc/videos",
              label: t("nav.ugcVideos"),
              icon: Video,
              description: t("navDesc.ugcVideos"),
            },
          ],
        },
        {
          title: t("navSection.tests"),
          items: [
            { to: "/admin/tests", label: t("nav.tests"), icon: FlaskConical, description: t("navDesc.tests") },
            {
              to: "/admin/test-nettoyage",
              label: t("nav.testNettoyage"),
              icon: Wand2,
              description: t("navDesc.testNettoyage"),
            },
          ],
        },
        {
          title: t("navSection.suivi"),
          items: [
            {
              to: "/admin/analytics",
              label: t("nav.analytics"),
              icon: BarChart3,
              description: t("navDesc.analytics"),
            },
            { to: "/admin/posters", label: t("nav.posters"), icon: Users, description: t("navDesc.posters") },
            {
              to: "/admin/reviews",
              label: t("nav.reviews"),
              icon: MessageSquareQuote,
              description: t("navDesc.reviews"),
            },
          ],
        },
        {
          title: t("navSection.config"),
          items: [
            {
              to: "/admin/reglages",
              label: t("nav.reglages"),
              icon: Settings,
              description: t("navDesc.reglages"),
            },
            {
              to: "/admin/prompts",
              label: t("nav.prompts"),
              icon: MessageSquareQuote,
              description: t("navDesc.prompts"),
            },
            {
              to: "/admin/documents",
              label: t("documents.nav"),
              icon: BookOpen,
              description: t("documents.navDesc"),
            },
          ],
        },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
