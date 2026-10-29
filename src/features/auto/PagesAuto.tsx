import { CarteUpwork } from "@/features/upwork/CarteUpwork";
import { Interrupteurs } from "@/features/interrupteurs/Interrupteurs";
import { Lien1000Card } from "@/features/moteur/Lien1000Card";
import { PageCohortes } from "@/features/cohortes/PageCohortes";
import { PageNudges } from "@/features/nudges/PageNudges";
import { PagePipeline } from "@/features/pipeline/PagePipeline";
import { PageNeedsYou } from "@/features/needsYou/PageNeedsYou";
import { ResumeNeedsYou } from "@/features/needsYou/ResumeNeedsYou";
import { PageReponses } from "@/features/reponses/PageReponses";
import { AdminChatbotPage } from "@/pages/admin/AdminChatbotPage";
import { AdminCheckKillDoublePage } from "@/pages/admin/AdminCheckKillDoublePage";
import { AdminPaiePage } from "@/pages/admin/AdminPaiePage";

import { GrandInterrupteur } from "./GrandInterrupteur";
import { PageAuto } from "./PageAuto";
import { PageLogs } from "./PageLogs";

/**
 * Prompt 22 : les 9 pages de « Recruitment Automation ». Chacune reprend la
 * page d'avant ; les parties suivantes du prompt les refondent une à une.
 */

export function OverviewPage() {
  return (
    <PageAuto cle="overview">
      <GrandInterrupteur />
      <ResumeNeedsYou />
      <Interrupteurs />
      <CarteUpwork />
      <Lien1000Card />
    </PageAuto>
  );
}

export function RecruitsPage() {
  return (
    <PageAuto cle="recruits">
      <PagePipeline />
      <PageCohortes />
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
      <PageNudges />
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
