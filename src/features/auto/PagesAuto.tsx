import { CarteUpwork } from "@/features/upwork/CarteUpwork";
import { Interrupteurs } from "@/features/interrupteurs/Interrupteurs";
import { Lien1000Card } from "@/features/moteur/Lien1000Card";
import { PageMessagesEnvoyes } from "@/features/auto/sent/PageMessagesEnvoyes";
import { BandeauAttente } from "@/features/auto/sent/Attente";
import { CarteSante } from "@/features/frequences/Frequences";
import { PageDisputes } from "@/features/disputes/PageDisputes";
import { PageNeedsYou } from "@/features/needsYou/PageNeedsYou";
import { ResumeNeedsYou } from "@/features/needsYou/ResumeNeedsYou";
import { PageReponses } from "@/features/reponses/PageReponses";
import { PageCohortesTableau } from "@/features/cohortesTableau/PageCohortesTableau";
import { AdminChatbotPage } from "@/pages/admin/AdminChatbotPage";
import { AdminCheckKillDoublePage } from "@/pages/admin/AdminCheckKillDoublePage";
import { AdminPaiePage } from "@/pages/admin/AdminPaiePage";

import { GrandInterrupteur } from "./GrandInterrupteur";
import { CarteAujourdhui, CarteSemaine, SanteAuto } from "./Overview";
import { PageAuto } from "./PageAuto";
import { PageLogs } from "./PageLogs";
import { PageRecruits } from "./PageRecruits";
import { ContratsTest } from "./test/ContratsTest";

/**
 * Prompt 22 : les 9 pages de « Recruitment Automation ». Chacune reprend la
 * page d'avant ; les parties suivantes du prompt les refondent une à une.
 */

/**
 * Partie 3 : tout voir sur une page. Le grand interrupteur, le résumé de
 * Needs you (prompt 21, U6 : en haut), Switches, Health, Today, This week ;
 * puis le détail de la connexion Upwork et le lien à 1 000 abonnés (carte
 * Réglages, partie 1).
 */
export function OverviewPage() {
  return (
    <PageAuto cle="overview">
      <GrandInterrupteur />
      {/* 0432 : « X messages waiting » (Send dans Messages sent → Planned). */}
      <BandeauAttente />
      <ResumeNeedsYou />
      <Interrupteurs />
      <CarteSante>
        <SanteAuto />
      </CarteSante>
      <CarteAujourdhui />
      <CarteSemaine />
      {/* Prompt 25 v4 : les contrats de test (admin). */}
      <ContratsTest />
      <CarteUpwork />
      <Lien1000Card />
    </PageAuto>
  );
}

export function RecruitsPage() {
  return (
    <PageAuto cle="recruits">
      <PageRecruits />
    </PageAuto>
  );
}

export function CohortsPage() {
  return (
    <PageAuto cle="cohorts">
      <PageCohortesTableau />
    </PageAuto>
  );
}

export function DecisionsPage() {
  return (
    <PageAuto cle="decisions">
      <AdminCheckKillDoublePage />
    </PageAuto>
  );
}

export function SentPage() {
  return (
    <PageAuto cle="sent">
      <PageMessagesEnvoyes />
    </PageAuto>
  );
}

export function ReceivedPage() {
  return (
    <PageAuto cle="received">
      <PageReponses />
    </PageAuto>
  );
}

export function NeedsYouPage() {
  return (
    <PageAuto cle="needs">
      <PageNeedsYou />
    </PageAuto>
  );
}

export function DisputesPage() {
  return (
    <PageAuto cle="disputes">
      <PageDisputes />
    </PageAuto>
  );
}

export function PayrollPage() {
  return (
    <PageAuto cle="payroll">
      <AdminPaiePage />
    </PageAuto>
  );
}

export function FaqPage() {
  return (
    <PageAuto cle="faq">
      <AdminChatbotPage />
    </PageAuto>
  );
}

export function LogsPage() {
  return (
    <PageAuto cle="logs">
      <PageLogs />
    </PageAuto>
  );
}
