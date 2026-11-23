import { CarteUpwork } from "@/features/upwork/CarteUpwork";
import { Interrupteurs } from "@/features/interrupteurs/Interrupteurs";
import { Lien1000Card } from "@/features/moteur/Lien1000Card";
import { PageMessagesEnvoyes } from "@/features/auto/sent/PageMessagesEnvoyes";
import { FreinsEnvoi } from "@/features/auto/FreinsEnvoi";
import { CompteursHm } from "@/features/envoisMain/CompteursHm";
import { CarteSante } from "@/features/frequences/Frequences";
import { PageDisputes } from "@/features/disputes/PageDisputes";
import { PageNeedsYou } from "@/features/needsYou/PageNeedsYou";
import { BandeauCoherence } from "@/features/coherence/BandeauCoherence";
import { SectionDoubles } from "@/features/doubles/SectionDoubles";
import { PageProblemesClaire } from "@/features/problemes/PageProblemesClaire";
import { PageProblemesPosteurs } from "@/features/problemes/PageProblemesPosteurs";
import { PageReglesBots } from "@/features/problemes/PageReglesBots";
import { SectionSure } from "@/components/erreurs/SectionSure";
import { Replie } from "@/components/ui/replie";
import { PageReponsesOfficielles } from "@/features/officielles/PageReponsesOfficielles";
import { SectionSupport } from "@/features/support/SectionSupport";
import { PageAujourdhui } from "@/features/auto/aujourdhui/PageAujourdhui";
import { PageQualite } from "@/features/auto/aujourdhui/PageQualite";
import { PageReglagesAuto } from "@/features/auto/PageReglagesAuto";
import { SuiviParrainage } from "@/features/parrainageEmail/Branches";
import { BonusLundi } from "@/features/bonus/BonusLundi";
import { PageBonus } from "@/features/bonus/PageBonus";
import { AgentRuul, DernierImportRuul } from "@/features/ruul/AgentRuul";
import { PagePaieRuul } from "@/features/ruul/PagePaieRuul";
import { PageRapportKills } from "@/features/ckd/rapportKills/PageRapportKills";
import { InjoignablesRuul } from "@/features/ruul/InjoignablesRuul";
import { SuiviRuul } from "@/features/ruul/SuiviRuul";
import { PlateformesPosteurs } from "@/features/ruul/PlateformesPosteurs";
import { StatutsRuulApi } from "@/features/ruul/StatutsRuulApi";
import { VueParcoursRuul } from "@/features/ruul/VueParcoursRuul";
import { PageAjoutRuul, PageCandidatsRuul, PageCohortesRuul } from "@/features/ruul/PagesRuul";
import { PageRetirerSlack } from "@/features/slackRetrait/PageRetirerSlack";
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
import { CarteWhatsApp } from "@/features/whatsapp/CarteWhatsApp";
import { PretLundi } from "./pret/PretLundi";
import { ContratsTest } from "./test/ContratsTest";
import { PageUpworkAAjouter } from "@/features/upworkAjouter/PageUpworkAAjouter";

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
      <div className="space-y-4">
        {/* 0839 : la carte WhatsApp (numéro + accord, envois de la semaine, coût). */}
        <CarteWhatsApp />
        <PageRecruits />
      </div>
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
        {/* 21/11 (Max) : « À décider maintenant » est sur « Aujourd'hui » (le composant reste, rien n'est supprimé). */}
        {/* 0564 : les bonus du lundi (Comment Masters, parrainages, bonus en une phrase), envoyés au clic. */}
        <SectionSure nom="Bonus de lundi">
          <BonusLundi lienPage />
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
      <PageProblemesClaire />
    </PageAuto>
  );
}

/** 13/11 (Max) : l'ancienne vue des cartes Problèmes (hors menu, dans Réglages › Anciennes pages). */
export function CartesProblemesPage() {
  return (
    <PageAuto cle="cartes">
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

/** 18/11 (Max) : le rapport des kills du samedi et le contrôle de toute la base. */
export function RapportKillsPage() {
  return (
    <PageAuto cle="rapport_kills">
      <PageRapportKills />
    </PageAuto>
  );
}

/** 18/11 (Max) : la paie Ruul sur sa page (lot de la semaine, payés / pas prêts / exclus, historique). */
export function PaieRuulPage() {
  return (
    <PageAuto cle="paie_ruul">
      <PagePaieRuul />
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

/** 12/11 (OS clair) : Support, une section : Boîte, Aperçu posteur, Tester, Consignes, Règles, Catalogue, Tests, Suivi. */
export function SupportPage() {
  return (
    <PageAuto cle="support">
      <SectionSupport />
    </PageAuto>
  );
}

/** 12/11 (OS clair) : ce que Max doit faire maintenant. */
export function AujourdhuiPage() {
  return (
    <PageAuto cle="aujourdhui">
      <PageAujourdhui />
    </PageAuto>
  );
}

/** 21/11 (Max, point 10) : le rapport qualité du support, semaine par semaine. */
export function QualitePage() {
  return (
    <PageAuto cle="qualite">
      <PageQualite />
    </PageAuto>
  );
}

/** 12/11 (OS clair) : les interrupteurs et les pages sorties du menu. */
export function ReglagesAutoPage() {
  return (
    <PageAuto cle="reglages">
      <PageReglagesAuto />
    </PageAuto>
  );
}

/** 8/11 : le parrainage par email (par pays et par semaine, top des parrains, pays). */
export function ParrainagePage() {
  return (
    <PageAuto cle="parrainage">
      <SuiviParrainage />
    </PageAuto>
  );
}

/** 8/11 : les bonus (Donner un bonus, bonus de lundi, historique). */
export function BonusPage() {
  return (
    <PageAuto cle="bonus">
      <PageBonus />
    </PageAuto>
  );
}

/** 8/11 : les personnes désactivées dans l'OS encore membres actifs de Slack. */
export function RetirerSlackPage() {
  return (
    <PageAuto cle="slack">
      <PageRetirerSlack />
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

/** 9/11 (0577) : les candidatures du site (Ruul). */
export function CandidatsRuulPage() {
  return (
    <PageAuto cle="candidats_ruul">
      <PageCandidatsRuul />
    </PageAuto>
  );
}

/** 9/11 (0577) : les cohortes des posteurs du site, étape par étape. */
export function CohortesRuulPage() {
  return (
    <PageAuto cle="cohortes_ruul">
      <PageCohortesRuul />
    </PageAuto>
  );
}

/**
 * 10/11 : Ruul. En haut, la cohorte étape par étape et une ligne de pastilles
 * par posteur ; en bas, replié, l'agent Ruul et les imports (« Marquer ajouté »).
 */
export function UpworkAAjouterPage() {
  return (
    <PageAuto cle="upwork_ajouter">
      <PageUpworkAAjouter />
    </PageAuto>
  );
}

export function RuulSuiviPage() {
  return (
    <PageAuto cle="ruul_suivi">
      <div className="space-y-4">
        <SuiviRuul />
        {/* 0839 : la carte WhatsApp (numéro + accord, envois de la semaine, coût). */}
        <CarteWhatsApp />
        <PlateformesPosteurs />
        <StatutsRuulApi />
        <InjoignablesRuul />
        <VueParcoursRuul />
        <Replie titre="Agent Ruul et imports">
          <DernierImportRuul />
          <AgentRuul />
          <PageAjoutRuul />
        </Replie>
      </div>
    </PageAuto>
  );
}
