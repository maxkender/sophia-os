import { useQuery } from "@tanstack/react-query";
import { PageSure } from "@/components/erreurs/PageSure";
import { useTranslation } from "react-i18next";
import {
  ClipboardCheck,
  ClipboardList,
  Link2,
  MessageSquareWarning,
  AtSign,
  BarChart3,
  BookOpen,
  CalendarDays,
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
  Briefcase,
  Wallet,
  Landmark,
  LifeBuoy,
  UserCheck,
  UsersRound,
} from "lucide-react";

import { BandePause } from "@/features/auto/BandePause";
import { type EntreeMenuAuto, GROUPES_MENU, type GroupeMenu, MENU_AUTO } from "@/features/auto/pages";
import { lireAujourdhui } from "@/features/auto/aujourdhui/api";
import { useProblemes } from "@/features/auto/useProblemes";
import { useAuth } from "@/features/auth/AuthContext";
import { hoVoitLien } from "@/features/auth/pagesHeadOfOps";
import { AppShell } from "./AppShell";
import type { NavGroup, NavItem } from "./Sidebar";
import { useParrainageActif } from "@/features/bonus/parrainageActif";

/** Les icônes des pages de Recruitment Automation (prompt 22). */
const ICONES_MENU: Record<EntreeMenuAuto, LucideIcon> = {
  aujourdhui: ListChecks,
  qualite: Siren,
  cohortes: UsersRound,
  candidats: UserCheck,
  posteurs: Users,
  ruul: UserPlus,
  upwork: Briefcase,
  decisions: Gavel,
  paie: Wallet,
  paie_ruul: Landmark,
  rapport_kills: ClipboardCheck,
  support: LifeBuoy,
  reglages: SlidersHorizontal,
};

export function AdminLayout() {
  const { t } = useTranslation();
  const { role } = useAuth();
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

  // 21/11 (Max, point 7) : 7 groupes. Les pages de l'automatisation viennent de MENU_AUTO (avec leur groupe) ;
  // « Problèmes », « Pays » et « File de relecture » sortent du menu (adresses gardées, rien n'est supprimé).
  const auto = (groupe: GroupeMenu): NavItem[] =>
    MENU_AUTO.filter((m) => m.groupe === groupe).map((m) => ({
      to: m.to,
      label: t(`auto.menu.${m.cle}`),
      icon: ICONES_MENU[m.cle],
      description: t(`auto.menuDesc.${m.cle}`),
      // Support : les demandes « Pour Max » (paiement / urgent) ; Aujourd'hui : les alertes graves.
      ...(m.cle === "support" ? { badge: aujourdhui.data?.pour_max ?? 0 } : {}),
      ...(m.cle === "aujourdhui" ? { badge: problemes.problemes.filter((x) => x.gravite === "grave").length } : {}),
    }));
  const autres: Record<GroupeMenu, NavItem[]> = {
    aujourdhui: [],
    posteurs: [
      { to: "/admin/posters", label: t("nav.posters"), icon: Users, description: t("navDesc.posters") },
      { to: "/admin/comment-masters", label: t("nav.commentMasters"), icon: MessagesSquare, description: t("navDesc.commentMasters") },
      { to: "/admin/questionnaires", label: t("nav.questionnaires"), icon: ClipboardList, description: t("navDesc.questionnaires") },
      // Prompt 15, point 2 : caché tant que le bonus de parrainage est en pause (la route reste).
      ...(parrainage ? [{ to: "/admin/parrainages", label: t("nav.referral"), icon: Gift, description: t("navDesc.referral") }] : []),
    ],
    contenu: [
      { to: "/admin", label: t("nav.pilotage"), icon: Gauge, description: t("navDesc.pilotage") },
      { to: "/admin/calendrier", label: t("nav.calendrier"), icon: CalendarDays, description: t("navDesc.calendrier") },
      { to: "/admin/minuit", label: t("nav.minuit"), icon: MoonStar, description: t("navDesc.minuit") },
      { to: "/admin/sources", label: t("nav.sources"), icon: AtSign, description: t("navDesc.sources") },
      { to: "/admin/bible", label: t("nav.bible"), icon: BookOpen, description: t("navDesc.bible") },
      { to: "/admin/slideshows", label: t("nav.slideshows"), icon: ListOrdered, description: t("navDesc.slideshows") },
      { to: "/admin/creation", label: t("nav.creation"), icon: PenLine, description: t("navDesc.creation") },
      { to: "/admin/bibliotheque", label: t("nav.bibliotheque"), icon: Images, description: t("navDesc.bibliotheque") },
      { to: "/admin/ugc-ia", label: t("nav.ugcIa"), icon: Clapperboard, description: t("navDesc.ugcIa") },
      { to: "/admin/motion", label: t("nav.motion"), icon: Film, description: t("navDesc.motion") },
      // BLEO (docs/bleo.md) : la nouvelle distribution, à blanc. Relecture native et Fiches y sont depuis le 30/10.
      { to: "/admin/bleo", label: t("nav.bleo"), icon: Radar, description: t("navDesc.bleo") },
      { to: "/admin/bleo/plan", label: t("nav.bleoPlan"), icon: Shuffle, description: t("navDesc.bleoPlan") },
      { to: "/admin/bleo/familles", label: t("nav.bleoFamilles"), icon: GitBranch, description: t("navDesc.bleoFamilles"), end: false },
      // La fiche d'un podz (/admin/pods/<slug>) garde l'entrée allumée.
      { to: "/admin/pods", label: t("nav.pods"), icon: Boxes, description: t("navDesc.pods"), end: false },
      { to: "/admin/repartition", label: t("nav.repartition"), icon: Scale, description: t("navDesc.repartition") },
      { to: "/admin/relecture-native", label: t("nav.relectureNative"), icon: Languages, description: t("navDesc.relectureNative") },
      { to: "/admin/fiches", label: t("nav.fiches"), icon: Library, description: t("navDesc.fiches") },
      { to: "/admin/bleo/reglages", label: t("nav.bleoReglages"), icon: SlidersHorizontal, description: t("navDesc.bleoReglages") },
      { to: "/admin/posts-links", label: t("nav.postsLiens"), icon: Link2, description: t("navDesc.postsLiens") },
      { to: "/admin/quality-control", label: t("nav.qualite"), icon: ClipboardCheck, description: t("navDesc.qualite") },
      { to: "/admin/quality-feedback", label: t("nav.qualityFeedback"), icon: MessageSquareWarning, description: t("navDesc.qualityFeedback") },
      { to: "/admin/banc-relecture", label: t("nav.bancRelecture"), icon: ListChecks, description: t("navDesc.bancRelecture") },
    ],
    paie: [],
    recrutement: [],
    sante: [
      { to: "/admin/analytics", label: t("nav.analytics"), icon: BarChart3, description: t("navDesc.analytics") },
      { to: "/admin/suivi-rc", label: t("nav.suiviRc"), icon: LineChart, description: t("navDesc.suiviRc") },
      { to: "/admin/tests", label: t("nav.tests"), icon: FlaskConical, description: t("navDesc.tests") },
    ],
    reglages: [
      { to: "/admin/labels", label: t("nav.labelsApplications"), icon: Tags, description: t("navDesc.labelsApplications") },
      { to: "/admin/reglages", label: t("nav.reglages"), icon: Settings, description: t("navDesc.reglages") },
      { to: "/admin/chaine", label: t("nav.chaine"), icon: Workflow, description: t("navDesc.chaine") },
      { to: "/admin/documents", label: t("documents.nav"), icon: BookOpen, description: t("documents.navDesc") },
    ],
  };
  const groupesMenu: NavGroup[] = GROUPES_MENU.map((g) => ({
    title: t(`navSection.${g}`),
    items: [...auto(g), ...autres[g]],
  }));

  return (
    <AppShell
      navLabel={estHo ? t("headOfOps.badge") : t("nav.admin")}
      groups={filtrer(groupesMenu)}
    >
      <BandePause />
      <PageSure />
    </AppShell>
  );
}
