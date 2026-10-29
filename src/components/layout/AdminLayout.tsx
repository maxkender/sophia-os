import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  AtSign,
  BarChart3,
  BookOpen,
  CalendarDays,
  Columns2,
  Crosshair,
  FlaskConical,
  Flag,
  Gavel,
  Gauge,
  LineChart,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  type LucideIcon,
  Gift,
  GitBranch,
  Images,
  Languages,
  ListOrdered,
  MessageCircle,
  MessageSquareQuote,
  MessagesSquare,
  Workflow,
  MoonStar,
  PenLine,
  Package,
  Boxes,
  Radar,
  Scale,
  Send,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Tags,
  Users,
  UserPlus,
  Wallet,
} from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { BandePause } from "@/features/auto/BandePause";
import { PAGES_AUTO, type PageAuto } from "@/features/auto/pages";
import { useAuth } from "@/features/auth/AuthContext";
import { compterContestations } from "@/features/disputes/api";
import { lireCompteNeedsYou } from "@/features/needsYou/api";
import { hoVoitLien } from "@/features/auth/pagesHeadOfOps";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { SelectApplication } from "@/features/moteur/SelectApplication";
import { AppShell } from "./AppShell";
import type { NavGroup } from "./Sidebar";
import { useParrainageActif } from "@/features/bonus/parrainageActif";

/** Les icônes des pages de Recruitment Automation (prompt 22). */
const ICONES_AUTO: Record<PageAuto, LucideIcon> = {
  overview: LayoutDashboard,
  recruits: Workflow,
  decisions: Gavel,
  sent: Send,
  received: Inbox,
  needs: CircleAlert,
  disputes: Flag,
  payroll: Wallet,
  faq: MessageCircle,
  logs: ListTodo,
};

export function AdminLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { applications, slug, setSlug, application } = useApplication();
  const estHo = role === "head_of_ops";
  const parrainage = useParrainageActif();
  // Retours que des créateurs disent faux, en attente d'une vérification (0340).
  const needsYou = useQuery({ queryKey: ["needs-you", "compte"], queryFn: lireCompteNeedsYou, refetchInterval: 5 * 60_000 });
  const contestations = useQuery({ queryKey: ["disputes", "compte"], queryFn: compterContestations, refetchInterval: 5 * 60_000 });

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
        // BLEO (docs/bleo.md) : la nouvelle distribution, à blanc. Admin seulement.
        {
          title: t("navSection.bleo"),
          items: [
            { to: "/admin/bleo", label: t("nav.bleo"), icon: Radar, description: t("navDesc.bleo") },
            { to: "/admin/bleo/plan", label: t("nav.bleoPlan"), icon: Shuffle, description: t("navDesc.bleoPlan") },
            {
              to: "/admin/bleo/familles",
              label: t("nav.bleoFamilles"),
              icon: GitBranch,
              description: t("navDesc.bleoFamilles"),
              end: false,
            },
            { to: "/admin/bleo/podz", label: t("nav.bleoPodz"), icon: Package, description: t("navDesc.bleoPodz") },
            {
              to: "/admin/bleo/reglages",
              label: t("nav.bleoReglages"),
              icon: SlidersHorizontal,
              description: t("navDesc.bleoReglages"),
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
            // 28 oct. (partie E) : le suivi dans cet ordre, Cohorts · Posters ·
            // Decisions · Recruiting · Payroll · Follow-ups. Inactifs et Slack
            // à relier sortent du menu (routes gardées) : les inactifs sont dans
            // Decisions et dans un filtre de Posters, Slack se relie dans la
            // fiche du posteur.
            { to: "/admin/posters", label: t("nav.posters"), icon: Users, description: t("navDesc.posters") },
            // Account watch, Recruiting, Reviews, Cohorts, Follow-ups, Replies, Payroll, Pipeline,
            // Decisions : dans Recruitment Automation ou retirés (prompt 22), anciennes adresses redirigées.
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
            // Prompt 15, point 2 : caché tant que le bonus de parrainage est en pause (la route reste).
            ...(parrainage
              ? [
                  {
                    to: "/admin/parrainages",
                    label: t("nav.referral"),
                    icon: Gift,
                    description: t("navDesc.referral"),
                  },
                ]
              : []),
            {
              to: "/admin/comment-masters",
              label: t("nav.commentMasters"),
              icon: MessagesSquare,
              description: t("navDesc.commentMasters"),
            },
          ],
        },
        // Prompt 22 : tout le système du 2 nov. en une section, sous « Tracking ».
        {
          title: t("auto.section"),
          items: PAGES_AUTO.map((p) => ({
            to: p.to,
            label: t(`auto.pages.${p.cle}.titre`),
            icon: ICONES_AUTO[p.cle],
            description: t(`auto.phrases.${p.cle}`),
            // Prompt 21, U : le badge de « Needs you » (les cas urgents, sinon tous).
            ...(p.cle === "needs" ? { badge: needsYou.data ? needsYou.data.urgents || needsYou.data.total : 0 } : {}),
            // Prompt 21, R : les contestations ouvertes (et les retours contestés à trancher).
            ...(p.cle === "disputes" ? { badge: contestations.data?.ouvertes ?? 0 } : {}),
          })),
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
          ],
        },
      ])}
    >
      <BandePause />
      <Outlet />
    </AppShell>
  );
}
