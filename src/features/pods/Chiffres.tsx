// Les chiffres des podz : part dans les posts du jour, percées. Déplacé tel quel depuis la page Podz (20/11).
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { BarChart, type PointBarre } from "@/components/charts/BarChart";
import { abrege, exact } from "@/components/charts/echelle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { drapeauLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import type { PerceeTableau } from "./api";
import { OBJECTIF_PART_PODS, type ResumePods } from "./resume";

/** Les tableaux de la page Allocation : en-têtes en petites capitales, lignes fines. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2 pr-4 align-top last:pr-0";
const LIGNE = "border-b border-border/40";

const pourcent = (n: number | null | undefined, langue: string) =>
  n == null ? "—" : `${n.toLocaleString(langue === "fr" ? "fr-FR" : "en-US")} %`;

/** Les quatre chiffres du haut : la part des podz (hier, 7 jours), la file à valider, les percées. */
export function ChiffresPods({ resume }: { resume: ResumePods }) {
  const { t, i18n } = useTranslation();
  const { hier } = resume;
  return (
    <StatGroup>
      <StatTile
        label={t("pods.chiffres.hier")}
        value={pourcent(hier?.part, i18n.language)}
        detail={hier ? t("pods.chiffres.hierDetail", { pods: hier.publies_pods, total: hier.publies }) : undefined}
        trend={resume.jours.map((j) => j.part)}
      />
      <StatTile
        label={t("pods.chiffres.septJours")}
        value={pourcent(resume.septJours, i18n.language)}
        detail={t("pods.chiffres.objectif", { n: OBJECTIF_PART_PODS })}
      />
      <StatTile
        label={t("pods.chiffres.aValider")}
        value={resume.aValider}
        tone={resume.autoErreurs > 0 ? "alerte" : "neutre"}
        detail={
          resume.autoErreurs > 0
            ? t("pods.chiffres.autoErreurs", { n: resume.autoErreurs })
            : resume.podsEnAttente > 0
              ? t("pods.chiffres.aValiderDetail", { count: resume.podsEnAttente })
              : undefined
        }
      />
      <StatTile
        label={t("pods.chiffres.percees")}
        value={resume.percees}
        detail={
          resume.meilleure
            ? t("pods.chiffres.perceesDetail", { vues: abrege(resume.meilleure.vues, i18n.language) })
            : t("pods.chiffres.aucunePercee")
        }
      />
    </StatGroup>
  );
}

/** La part des podz jour par jour, face à l'objectif. */
export function CarteJours({ resume }: { resume: ResumePods }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const points: PointBarre[] = resume.jours.map((j) => {
    const d = new Date(`${j.jour}T12:00:00Z`);
    return {
      key: j.jour,
      axisLabel: d.toLocaleDateString(localeDate(langue), { day: "2-digit", month: "2-digit" }),
      tooltipTitle: `${d.toLocaleDateString(localeDate(langue), { weekday: "long", day: "numeric", month: "long" })} · ${j.publies_pods} / ${j.publies}`,
      value: j.part,
    };
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pods.jours.titre")}</CardTitle>
        <CardDescription>{t("pods.jours.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <BarChart
          points={points}
          average={points.map(() => OBJECTIF_PART_PODS)}
          averageLabel={t("pods.jours.objectif")}
          valueLabel={t("pods.jours.serie")}
          height={180}
          formatTick={(n) => `${n} %`}
          formatValue={(n) => pourcent(n, langue)}
          ariaLabel={t("pods.jours.titre")}
        />
      </CardContent>
    </Card>
  );
}

/** Ce qui perce : les posts des podz à 30 k vues ou plus sur 14 jours. */
export function CartePercees({ percees, nomPod }: { percees: PerceeTableau[]; nomPod: Map<string, string> }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pods.tableau.percees")}</CardTitle>
        <CardDescription>{t("pods.perceesDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="relative overflow-x-auto">
        {percees.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pods.tableau.aucunePercee")}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className={cn(TH, "text-right")}>{t("pods.colonnes.vues")}</th>
                <th className={TH}>{t("pods.colonnes.accroche")}</th>
                <th className={TH}>{t("pods.colonnes.appli")}</th>
              </tr>
            </thead>
            <tbody>
              {percees.slice(0, 8).map((pe) => {
                const accroche = pe.accroche?.replace(/\s+/g, " ") ?? "—";
                return (
                  <tr key={`${pe.contenu_id}-${pe.compte}-${pe.jour}`} className={LIGNE}>
                    <td className={cn(TD, "text-right font-semibold tabular-nums")} title={exact(pe.vues, i18n.language)}>
                      {abrege(pe.vues, i18n.language)}
                    </td>
                    <td className={cn(TD, "min-w-0")}>
                      {pe.url ? (
                        <a
                          href={pe.url}
                          target="_blank"
                          rel="noreferrer"
                          title={accroche}
                          className="flex max-w-[22rem] items-center gap-1.5 hover:underline"
                        >
                          <span className="truncate">{accroche}</span>
                          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                        </a>
                      ) : (
                        <span className="block max-w-[22rem] truncate" title={accroche}>
                          {accroche}
                        </span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {[nomPod.get(pe.pod) ?? pe.pod, `${drapeauLangue(pe.langue)} ${pe.langue}`, pe.tier ? t("pods.rangCourt", { tier: pe.tier }) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className={TD}>
                      <LogoApplication slug={pe.application} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
