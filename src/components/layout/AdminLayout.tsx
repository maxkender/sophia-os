import { useQuery } from "@tanstack/react-query";
import { PageSure } from "@/components/erreurs/PageSure";
import { useTranslation } from "react-i18next";
import {
  ClipboardCheck,
  Link2,
  MessageSquareWarning,
  AtSign,
  BarChart3,
  BookOpen,
  CalendarDays,
  Columns2,
  FlaskConical,
  Gavel,
  Gauge,
  LineChart,
  ListChecks,
  Siren,
  type LucideIcon,
  Gift,
  GitBranch,
  Images,
  Languages,
  Library,
  ListOrdered,
  MessagesSquare,
  Workflow,
  Clapperboard,
  Film,
  MoonStar,
  PenLine,
  Boxes,
  Radar,
  Scale,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Tags,
  Users,
  UserPlus,
  Wallet,
  Globe2,
  LifeBuoy,
} from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { BandePause } from "@/features/auto/BandePause";
import { type EntreeMenuAuto, MENU_AUTO } from "@/features/auto/pages";
import { lireAujourdhui } from "@/features/auto/aujourdhui/api";
import { useProblemes } from "@/features/auto/useProblemes";
import { useAuth } from "@/features/auth/AuthContext";
import { hoVoitLien } from "@/features/auth/pagesHeadOfOps";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { SelectApplication } from "@/features/moteur/SelectApplication";
import { AppShell } from "./AppShell";
import type { NavGroup } from "./Sidebar";
import { useParrainageActif } from "@/features/bonus/parrainageActif";

/** Les icônes des pages de Recruitment Automation (prompt 22). */
const ICONES_MENU: Record<EntreeMenuAuto, LucideIcon> = {
  aujourdhui: ListChecks,
  problemes: Siren,
  posteurs: Users,
  ruul: UserPlus,
  decisions: Gavel,
  paie: Wallet,
  support: LifeBuoy,
  reglages: SlidersHorizontal,
};

export function AdminLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { applications, slug, setSlug, application } = useApplication();
  const estHo = role === "head_of_ops";
  const parrainage = useParrainageActif();
  // Retours que des créateurs disent faux, en attente d'une vérification (0340).
  const aujourdhui = useQuery({ queryKey: ["os", "aujourdhui"], queryFn: lireAujourdhui, refetchInterval: 5 * 60_000, enabled: role === "admin" || role === "head_of_ops" });
  // Le badge de Problems : seulement pour l'admin et la Head of Ops (Health leur est réservé).
  const problemes = useProblemes(role === "admin" || role === "head_of_ops");

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
              to: "/admin/bibliotheque",
              label: t("nav.bibliotheque"),
              icon: Images,
              description: t("navDesc.bibliotheque"),
            },
            {
              to: "/admin/ugc-ia",
              label: t("nav.ugcIa"),
              icon: Clapperboard,
              description: t("navDesc.ugcIa"),
            },
            {
              to: "/admin/motion",
              label: t("nav.motion"),
              icon: Film,
              description: t("navDesc.motion"),
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
            // Pods (avec la boîte des podz en bas) et Allocation : déplacées ici telles quelles.
            {
              to: "/admin/pods",
              label: t("nav.pods"),
              icon: Boxes,
              description: t("navDesc.pods"),
            },
            {
              to: "/admin/repartition",
              label: t("nav.repartition"),
              icon: Scale,
              description: t("navDesc.repartition"),
            },
            // Relecture native et Fiches (la réécriture native) : déplacées ici telles quelles (30/10).
            {
              to: "/admin/relecture-native",
              label: t("nav.relectureNative"),
              icon: Languages,
              description: t("navDesc.relectureNative"),
            },
            {
              to: "/admin/fiches",
              label: t("nav.fiches"),
              icon: Library,
              description: t("navDesc.fiches"),
            },
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
              to: "/admin/quality-control",
              label: t("nav.qualite"),
              icon: ClipboardCheck,
              description: t("navDesc.qualite"),
            },
            // 31/10 : sortis de Recruitment Automation → Disputes.
            {
              to: "/admin/posts-links",
              label: t("nav.postsLiens"),
              icon: Link2,
              description: t("navDesc.postsLiens"),
            },
            {
              to: "/admin/quality-feedback",
              label: t("nav.qualityFeedback"),
              icon: MessageSquareWarning,
              description: t("navDesc.qualityFeedback"),
            },
            {
              to: "/admin/suivi-rc",
              label: t("nav.suiviRc"),
              icon: LineChart,
              description: t("navDesc.suiviRc"),
            },
            // 2/11 : la page Pays (décision par marché de langue).
            {
              to: "/admin/pays",
              label: t("nav.pays"),
              icon: Globe2,
              description: t("navDesc.pays"),
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
        // 12/11 (OS clair) : la section en 7 entrées ; les autres pages sont dans Réglages (adresses gardées).
        {
          title: t("auto.section"),
          items: MENU_AUTO.map((m) => ({
            to: m.to,
            label: t(`auto.menu.${m.cle}`),
            icon: ICONES_MENU[m.cle],
            description: t(`auto.menuDesc.${m.cle}`),
            // Support : les demandes « Pour Max » (paiement / urgent) ; Aujourd'hui : les alertes graves.
            ...(m.cle === "support" ? { badge: aujourdhui.data?.pour_max ?? 0 } : {}),
            ...(m.cle === "aujourdhui" ? { badge: problemes.problemes.filter((x) => x.gravite === "grave").length } : {}),
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
              to: "/admin/chaine",
              label: t("nav.chaine"),
              icon: Workflow,
              description: t("navDesc.chaine"),
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
      <PageSure />
    </AppShell>
  );
}
