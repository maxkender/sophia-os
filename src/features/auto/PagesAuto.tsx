import { CarteUpwork } from "@/features/upwork/CarteUpwork";
import { Interrupteurs } from "@/features/interrupteurs/Interrupteurs";
import { Lien1000Card } from "@/features/moteur/Lien1000Card";
import { PageMessagesEnvoyes } from "@/features/auto/sent/PageMessagesEnvoyes";
import { FreinsEnvoi } from "@/features/auto/FreinsEnvoi";
import { CompteursHm } from "@/features/envoisMain/CompteursHm";
import { CarteSante } from "@/features/frequences/Frequences";
import { PageDisputes } from "@/features/disputes/PageDisputes";
import { PageNeedsYou } from "@/features/needsYou/PageNeedsYou";
import { ADeciderMaintenant } from "@/features/problemes/ADeciderMaintenant";
import { BandeauCoherence } from "@/features/coherence/BandeauCoherence";
import { SectionDoubles } from "@/features/doubles/SectionDoubles";
import { PageProblemesPosteurs } from "@/features/problemes/PageProblemesPosteurs";
import { PageReglesBots } from "@/features/problemes/PageReglesBots";
import { SectionSure } from "@/components/erreurs/SectionSure";
import { PageReponsesOfficielles } from "@/features/officielles/PageReponsesOfficielles";
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
import { PageProblemes } from "./PageProblemes";
import { PageRecruits } from "./PageRecruits";
import { PretLundi } from "./pret/PretLundi";
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
      {/* Lundi 2/11 : tout est-il prêt pour lundi ? (vert / rouge, avec la page qui corrige) */}
      <PretLundi />
      {/* Prompt 25 MAJ : un type de message en pause (frein) se voit tout de suite, avec « Resume ». */}
      <FreinsEnvoi />
      <ResumeNeedsYou />
      <Interrupteurs />
      <CarteSante>
        <SanteAuto />
      </CarteSante>
      {/* Prompt 25 MAJ, point 8 : les messages confiés aux HM, par HM (aujourd'hui, 7 jours). */}
      <CompteursHm />
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

/** 5/11 : Weekly decisions = LA page où Max décide : « À décider maintenant », puis jeudi, samedi, dimanche. */
export function DecisionsPage() {
  return (
    <PageAuto cle="decisions">
      <div className="space-y-6">
        <SectionSure nom="Cohérence">
          <BandeauCoherence />
        </SectionSure>
        {/* 6/11 : une section qui plante n'emporte plus la page. */}
        <SectionSure nom="À décider maintenant">
          <ADeciderMaintenant />
        </SectionSure>
        <SectionSure nom="Weekly decisions">
          <AdminCheckKillDoublePage />
        </SectionSure>
        {/* 0559 : Doubler = une proposition au posteur ; son suivi. */}
        <SectionSure nom="2e comptes proposés">
          <SectionDoubles />
        </SectionSure>
      </div>
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

/** Bloc C (2/11) : « Problems » remplace Needs you (même place dans le menu). */
export function NeedsYouPage() {
  return (
    <PageAuto cle="needs">
      <PageProblemesPosteurs />
    </PageAuto>
  );
}

/** 3/11 : « Règles des bots » (feedback → règles lues par les bots), sous Problèmes dans le menu. */
export function ReglesBotsPage() {
  return (
    <PageAuto cle="needs">
      <PageReglesBots />
    </PageAuto>
  );
}

/** L'ancienne page Needs you, hors menu, ouverte pendant les 2 jours de test. */
export function NeedsYouAncienPage() {
  return (
    <PageAuto cle="needs">
      <PageNeedsYou />
    </PageAuto>
  );
}

export function ProblemsPage() {
  return (
    <PageAuto cle="problems">
      <PageProblemes />
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

/** 6/11 : les réponses officielles (question, réponse en anglais, validée par Max). */
export function ReponsesOfficiellesPage() {
  return (
    <PageAuto cle="officielles">
      <PageReponsesOfficielles />
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
