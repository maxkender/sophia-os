import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  BarChart3,
  BookOpen,
  CalendarDays,
  Clapperboard,
  FlaskConical,
  Gauge,
  Gift,
  Images,
  ListOrdered,
  MessageCircle,
  MessageSquareQuote,
  MoonStar,
  PenLine,
  Scissors,
  Settings,
  UserRound,
  Users,
  Video,
} from "lucide-react";

import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { SelectApplication } from "@/features/moteur/SelectApplication";
import { AppShell } from "./AppShell";

export function AdminLayout() {
  const { t } = useTranslation();
  const { applications, slug, setSlug, application, isPending } = useApplication();
  return (
    <AppShell
      navLabel={t("nav.admin")}
      sidebarExtra={
        isPending || applications.length > 0 ? (
          <div className="space-y-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/70">
              {t("applications.switcher")}
            </p>
            {applications.length > 0 ? (
              <SelectApplication
                applications={applications}
                value={slug}
                onChange={setSlug}
              />
            ) : (
              <p className="px-1 text-[10px] text-sidebar-foreground/70">…</p>
            )}
            {application && (
              <p className="px-1 text-[10px] text-sidebar-foreground">
                {t("applications.contexte", { nom: nomApplication(application) })}
              </p>
            )}
          </div>
        ) : undefined
      }
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
              to: "/admin/sources",
              label: t("nav.sources"),
              icon: AtSign,
              description: t("navDesc.sources"),
            },
            {
              to: "/admin/slideshows",
              label: t("nav.slideshows"),
              icon: ListOrdered,
              description: t("navDesc.slideshows"),
            },
            {
              to: "/admin/creation",
              label: t("nav.creation"),
              icon: PenLine,
              description: t("navDesc.creation"),
            },
            {
              to: "/admin/papier",
              label: t("nav.papier"),
              icon: Scissors,
              description: t("navDesc.papier"),
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
            {
              to: "/admin/parrainages",
              label: t("nav.referral"),
              icon: Gift,
              description: t("navDesc.referral"),
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
            {
              to: "/admin/assistant",
              label: t("chatbot.nav"),
              icon: MessageCircle,
              description: t("chatbot.navDesc"),
            },
          ],
        },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
