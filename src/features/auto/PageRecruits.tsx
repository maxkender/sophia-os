import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { AccueilAuto } from "@/features/accueil/AccueilAuto";
import { Arrets } from "@/features/cohortes/Arrets";
import { TableauParHm } from "@/features/cohortes/PageCohortes";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { lirePipeline } from "@/features/pipeline/api";
import { PagePipeline } from "@/features/pipeline/PagePipeline";
import { localeDate } from "@/locales/localeDate";

import { cohorteParDefautRecruits } from "./logique";

/**
 * Recruits (prompt 22, partie 4) : Pipeline et Cohorts fusionnés. En haut
 * « Contracts to link » (avec son compteur), puis le filtre par lundi de
 * cohorte, la vue Pipeline (6 colonnes, cartes en direct, panneau à droite ;
 * Cancel Kill, Stop et Send on Upwork restent confirmés), les arrêts complets
 * et leurs actions à la main, et le tableau par HM.
 */
export function PageRecruits({ maintenant }: { maintenant?: Date } = {}) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const cartes = useQuery({ queryKey: ["pipeline", "cartes"], queryFn: lirePipeline, refetchInterval: 60_000 });
  const lundis = React.useMemo(() => [...new Set((cartes.data ?? []).map((c) => c.cohorte_lundi))].sort(), [cartes.data]);
  const [choix, setChoix] = React.useState<string | null>(null);
  const cohorte = choix ?? cohorteParDefautRecruits(lundis, aujourdhuiParis(maintenant));
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), { day: "numeric", month: "short", timeZone: "UTC" });
  // Les liens d'Overview vers #contrats ou #arrets : PageAuto y descend.

  return (
    <div className="space-y-6" data-testid="page-recruits">
      <div id="contrats" className="scroll-mt-4">
        <AccueilAuto />
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t("auto.recruits.cohorte")}</span>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={cohorte}
          onChange={(e) => setChoix(e.target.value)}
          data-testid="filtre-cohorte"
        >
          <option value="">{t("auto.recruits.toutes")}</option>
          {lundis.map((l) => (
            <option key={l} value={l}>
              {t("auto.recruits.lundi", { date: fmt.format(new Date(`${l}T12:00:00Z`)) })}
            </option>
          ))}
        </select>
      </label>

      <PagePipeline maintenant={maintenant} cohorte={cohorte} risqueInitial={params.get("risque") === "1"} />

      <div id="arrets" className="scroll-mt-4">
        <Arrets />
      </div>

      <TableauParHm maintenant={maintenant} />
    </div>
  );
}
