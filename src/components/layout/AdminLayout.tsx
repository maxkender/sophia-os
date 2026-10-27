import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  Columns2,
  Crosshair,
  FlaskConical,
  Flag,
  Gavel,
  Gauge,
  LineChart,
  ListChecks,
  Gift,
  Images,
  Languages,
  Link2,
  ListOrdered,
  MessageCircle,
  MessageSquareQuote,
  MessagesSquare,
  MoonStar,
  PenLine,
  Boxes,
  Scale,
  Settings,
  Tags,
  ShieldAlert,
  Users,
  UserPlus,
  UserX,
  Wallet,
} from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { useAuth } from "@/features/auth/AuthContext";
import { compterContestationsAVerifier } from "@/features/moteur/api";
import { hoVoitLien } from "@/features/auth/pagesHeadOfOps";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { SelectApplication } from "@/features/moteur/SelectApplication";
import { AppShell } from "./AppShell";
import type { NavGroup } from "./Sidebar";

export function AdminLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { applications, slug, setSlug, application } = useApplication();
  const estHo = role === "head_of_ops";
  // Retours que des créateurs disent faux, en attente d'une vérification (0340).
  const contestations = useQuery({
    queryKey: ["contestations-a-verifier"],
    queryFn: compterContestationsAVerifier,
    refetchInterval: 5 * 60_000,
  });

  /**
   * Le Head of Ops partage la coquille de l'admin mais n'a droit qu'aux
   * pages de `ROUTES_HO`. On filtre ici ET dans le routeur, à partir de la
   * même liste : un menu qui cache ce que la route laisse passer n'est pas une
   * restriction. Les groupes vidés disparaissent, sinon il verrait des titres
   * de section sans rien dessous.
   */
  const filtrer = (groupes: NavGroup[]): NavGroup[] => {
    if (!estHo) return groupes;
    const gardes = groupes
      .map((g) => ({ ...g, items: g.items.filter((i) => hoVoitLien(i.to)) }))
      .filter((g) => g.items.length > 0);
    // Le Head of Ops a deux espaces : sans ce pont, il ne peut plus revenir à son
    // espace recrutement une fois entré ici.
    return [
      ...gardes,
      {
        title: t("headOfOps.autreEspace"),
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
      navLabel={estHo ? t("headOfOps.badge") : t("nav.admin")}
      sidebarExtra={
        applications.length > 0 ? (
          <div className="space-y-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/70">
              {t("applications.switcher")}
            </p>
            <div className="flex items-center gap-2">
              {application && (
                <LogoApplication slug={application.slug} taille="md" />
              )}
              <div className="min-w-0 flex-1">
                <SelectApplication
                  applications={applications}
                  value={slug}
                  onChange={setSlug}
                />
              </div>
            </div>
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
              to: "/admin/pods",
              label: t("nav.pods"),
              icon: Boxes,
              description: t("navDesc.pods"),
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
            {
              to: "/admin/check-kill-double",
              label: t("nav.checkKillDouble"),
              icon: Gavel,
              description: t("navDesc.checkKillDouble"),
            },
            { to: "/admin/paie", label: t("paie.nav"), icon: Wallet, description: t("paie.navDesc") },
            {
              to: "/admin/nudges",
              label: t("nudges.nav"),
              icon: BellRing,
              description: t("nudges.navDesc"),
            },
            {
              to: "/admin/inactifs",
              label: t("inactifs.nav"),
              icon: UserX,
              description: t("inactifs.navDesc"),
            },
            {
              to: "/admin/slack",
              label: t("slackRelier.nav"),
              icon: Link2,
              description: t("slackRelier.navDesc"),
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
              to: "/admin/retours-contestes",
              label: t("nav.retoursContestes"),
              icon: Flag,
              description: t("navDesc.retoursContestes"),
              badge: contestations.data ?? 0,
            },
            {
              to: "/admin/file-reviews",
              label: t("nav.fileReviews"),
              icon: Columns2,
              description: t("navDesc.fileReviews"),
            },
            {
              to: "/admin/banc-relecture",
              label: t("nav.bancRelecture"),
              icon: ListChecks,
              description: t("navDesc.bancRelecture"),
            },
            {
              to: "/admin/parrainages",
              label: t("nav.referral"),
              icon: Gift,
              description: t("navDesc.referral"),
            },
            {
              to: "/admin/comment-masters",
              label: t("nav.commentMasters"),
              icon: MessagesSquare,
              description: t("navDesc.commentMasters"),
            },
          ],
        },
        {
          title: t("navSection.config"),
          items: [
            {
              to: "/admin/labels",
              label: t("nav.labelsApplications"),
              icon: Tags,
              description: t("navDesc.labelsApplications"),
            },
            {
              to: "/admin/reglages",
              label: t("nav.reglages"),
              icon: Settings,
              description: t("navDesc.reglages"),
            },
            {
              to: "/admin/repartition",
              label: t("nav.repartition"),
              icon: Scale,
              description: t("navDesc.repartition"),
            },
            {
              to: "/admin/prompts",
              label: t("nav.prompts"),
              icon: MessageSquareQuote,
              description: t("navDesc.prompts"),
            },
            {
              to: "/admin/angles",
              label: t("nav.angles"),
              icon: Crosshair,
              description: t("navDesc.angles"),
            },
            {
              to: "/admin/relecture-native",
              label: t("nav.relectureNative"),
              icon: Languages,
              description: t("navDesc.relectureNative"),
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
