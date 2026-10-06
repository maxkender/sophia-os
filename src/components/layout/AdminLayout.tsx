import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  BarChart3,
  BookOpen,
  CalendarDays,
  Columns2,
  FlaskConical,
  Gauge,
  LineChart,
  Gift,
  Images,
  ListOrdered,
  MessageCircle,
  MessageSquareQuote,
  MoonStar,
  PenLine,
  Settings,
  ShieldAlert,
  Users,
  UserPlus,
} from "lucide-react";

import { useAuth } from "@/features/auth/AuthContext";
import { cosVoitLien } from "@/features/auth/pagesCos";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { SelectApplication } from "@/features/moteur/SelectApplication";
import { AppShell } from "./AppShell";
import type { NavGroup } from "./Sidebar";

export function AdminLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { applications, slug, setSlug, application } = useApplication();
  const estCos = role === "chief_of_staff";

  /**
   * Le Chief of Staff partage la coquille de l'admin mais n'a droit qu'aux
   * pages de `ROUTES_COS`. On filtre ici ET dans le routeur, à partir de la
   * même liste : un menu qui cache ce que la route laisse passer n'est pas une
   * restriction. Les groupes vidés disparaissent, sinon il verrait des titres
   * de section sans rien dessous.
   */
  const filtrer = (groupes: NavGroup[]): NavGroup[] => {
    if (!estCos) return groupes;
    const gardes = groupes
      .map((g) => ({ ...g, items: g.items.filter((i) => cosVoitLien(i.to)) }))
      .filter((g) => g.items.length > 0);
    // Le COS a deux espaces : sans ce pont, il ne peut plus revenir à son
    // espace recrutement une fois entré ici.
    return [
      ...gardes,
      {
        title: t("cos.autreEspace"),
        items: [
          {
            to: "/embauche",
            label: t("nav.embauche"),
            icon: UserPlus,
            description: t("navDesc.embauche"),
          },
        ],
      },
    ];
  };

  return (
    <AppShell
      navLabel={estCos ? t("cos.badge") : t("nav.admin")}
      sidebarExtra={
        applications.length > 0 ? (
          <div className="space-y-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/70">
              {t("applications.switcher")}
            </p>
            <SelectApplication
              applications={applications}
              value={slug}
              onChange={setSlug}
            />
            {application && (
              <p className="px-1 text-[10px] text-sidebar-foreground">
                {t("applications.contexte", { nom: nomApplication(application) })}
              </p>
            )}
          </div>
        ) : undefined
      }
      groups={filtrer([
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
              to: "/admin/bibliotheque",
              label: t("nav.bibliotheque"),
              icon: Images,
              description: t("navDesc.bibliotheque"),
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
            {
              to: "/admin/suivi-rc",
              label: t("nav.suiviRc"),
              icon: LineChart,
              description: t("navDesc.suiviRc"),
            },
            { to: "/admin/posters", label: t("nav.posters"), icon: Users, description: t("navDesc.posters") },
            {
              to: "/admin/surveillance",
              label: t("nav.surveillance"),
              icon: ShieldAlert,
              description: t("navDesc.surveillance"),
            },
            // Toujours visible : le recrutement relève de l'identité des
            // comptes, qui reste Sophia quelle que soit l'application choisie.
            {
              to: "/admin/recrutements",
              label: t("nav.recrutements"),
              icon: UserPlus,
              description: t("navDesc.recrutements"),
              end: false,
            },
            {
              to: "/admin/reviews",
              label: t("nav.reviews"),
              icon: MessageSquareQuote,
              description: t("navDesc.reviews"),
            },
            {
              to: "/admin/file-reviews",
              label: t("nav.fileReviews"),
              icon: Columns2,
              description: t("navDesc.fileReviews"),
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
      ])}
    >
      <Outlet />
    </AppShell>
  );
}
