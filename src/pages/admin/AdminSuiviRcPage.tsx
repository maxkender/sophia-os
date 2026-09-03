import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LineChart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { chargerSuiviRc, listerComptes } from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import {
  formaterValeur,
  mesurePrincipale,
  normaliserChart,
  point,
  segmentsPays,
} from "@/features/revenuecat/normaliser";
import {
  formaterMoyenneTrials,
  formaterRatio,
  lignesPerformanceCreateurs,
} from "@/features/revenuecat/performanceCreateurs";
import type { ChartNormalise, ChartRcBrut, MesureRc } from "@/features/revenuecat/types";
import { cn } from "@/lib/utils";

const TTL_MS = 4 * 60 * 60 * 1000;

function libellePeriode(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  });
}

function formaterQuand(iso: string | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

function TableauPaysPeriodes({
  chart,
  measure,
  locale,
  incompleteLabel,
  paysLabel,
}: {
  chart: ChartNormalise;
  measure: MesureRc;
  locale: string;
  incompleteLabel: string;
  paysLabel: string;
}) {
  const pays = segmentsPays(chart);
  const total = chart.segments.find((s) => s.total);
  const lignes = total ? [total, ...pays] : pays;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card py-2 pr-3 font-medium">{paysLabel}</th>
            {chart.dates.map((date) => (
              <th key={date} className="px-2 py-2 text-right font-medium tabular-nums">
                {libellePeriode(date, locale)}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Σ</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((seg) => (
            <tr
              key={seg.nom}
              className={cn("border-b last:border-0", seg.total && "font-medium")}
            >
              <th className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-left font-medium">
                {seg.nom}
              </th>
              {chart.dates.map((date) => {
                const p = point(chart, date, seg.nom, measure.nom);
                return (
                  <td
                    key={date}
                    className={cn(
                      "px-2 py-1.5 text-right tabular-nums",
                      p?.incomplete && "text-muted-foreground",
                    )}
                    title={p?.incomplete ? incompleteLabel : undefined}
                  >
                    {p ? formaterValeur(p.value, measure) : "—"}
                    {p?.incomplete ? "*" : ""}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right tabular-nums">
                {chart.totaux[seg.nom]?.[measure.nom] != null
                  ? formaterValeur(chart.totaux[seg.nom][measure.nom], measure)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarteChart({
  titre,
  desc,
  brut,
  locale,
  incompleteLabel,
  extraMesures,
  vide,
  paysLabel,
}: {
  titre: string;
  desc: string;
  brut: ChartRcBrut | undefined;
  locale: string;
  incompleteLabel: string;
  extraMesures?: string[];
  vide: string;
  paysLabel: string;
}) {
  const chart = normaliserChart(brut);
  const principale = mesurePrincipale(chart);
  const extras = (extraMesures ?? [])
    .map((nom) => chart.measures.find((m) => m.nom === nom))
    .filter((m): m is MesureRc => Boolean(m));

  if (!principale || chart.dates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{titre}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title={vide} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {extras.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{paysLabel}</th>
                  {[principale, ...extras].map((m) => (
                    <th key={m.nom} className="px-2 py-2 text-right font-medium">
                      {m.nom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segmentsPays(chart).map((seg) => (
                  <tr key={seg.nom} className="border-b last:border-0">
                    <th className="py-1.5 pr-3 text-left font-medium">{seg.nom}</th>
                    {[principale, ...extras].map((m) => (
                      <td key={m.nom} className="px-2 py-1.5 text-right tabular-nums">
                        {chart.totaux[seg.nom]?.[m.nom] != null
                          ? formaterValeur(chart.totaux[seg.nom][m.nom], m)
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TableauPaysPeriodes
          chart={chart}
          measure={principale}
          locale={locale}
          incompleteLabel={incompleteLabel}
          paysLabel={paysLabel}
        />
      </CardContent>
    </Card>
  );
}

function CartePerformanceCreateurs({
  chart,
  comptes,
  chargement,
}: {
  chart: ChartNormalise;
  comptes: Parameters<typeof lignesPerformanceCreateurs>[1];
  chargement: boolean;
}) {
  const { t } = useTranslation();
  const lignes = lignesPerformanceCreateurs(chart, comptes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("suiviRc.perfTitre")}</CardTitle>
        <CardDescription>{t("suiviRc.perfDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {chargement && lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : lignes.length === 0 ? (
          <EmptyState title={t("suiviRc.perfVide")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("suiviRc.perfLangue")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("suiviRc.perfTrialsJour")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("suiviRc.perfCreateurs")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("suiviRc.perfRatio")}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.langue} className="border-b last:border-0">
                    <th className="py-1.5 pr-3 text-left font-medium">{nomLangue(ligne.langue)}</th>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formaterMoyenneTrials(ligne.trialsJour)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{ligne.createurs}</td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {formaterRatio(ligne.ratio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminSuiviRcPage() {
  const { t, i18n } = useTranslation();
  const suivi = useQuery({
    queryKey: ["suivi-rc"],
    queryFn: chargerSuiviRc,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const comptes = useQuery({
    queryKey: ["comptes"],
    queryFn: listerComptes,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const snap = suivi.data?.snapshot;
  const prochain = snap?.fetched_at
    ? new Date(new Date(snap.fetched_at).getTime() + TTL_MS).toISOString()
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LineChart className="size-5" />
            {t("suiviRc.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("suiviRc.subtitle")}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
          {snap?.fetched_at && (
            <p>
              {t("suiviRc.majLe", { quand: formaterQuand(snap.fetched_at, i18n.language) })}
            </p>
          )}
          {prochain && (
            <p>{t("suiviRc.prochaine", { quand: formaterQuand(prochain, i18n.language) })}</p>
          )}
          {suivi.data?.depuis_cache && <Badge variant="secondary">{t("suiviRc.cache")}</Badge>}
        </div>
      </div>

      {suivi.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {suivi.isError && (
        <p className="text-sm text-destructive">{(suivi.error as Error).message}</p>
      )}

      {suivi.data?.secret_manquant && !snap && (
        <EmptyState title={t("suiviRc.secretTitre")} description={t("suiviRc.secretDesc")} />
      )}

      {suivi.data?.secret_manquant && snap && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{t("suiviRc.secretDesc")}</p>
      )}

      {snap?.erreur && (
        <p className="text-sm text-destructive">{t("suiviRc.erreurFetch", { msg: snap.erreur })}</p>
      )}

      {snap?.charts && (
        <div className="space-y-4">
          <CarteChart
            titre={t("suiviRc.paywallTitre")}
            desc={t("suiviRc.paywallDesc")}
            brut={snap.charts.initial_conversion}
            locale={i18n.language}
            incompleteLabel={t("suiviRc.incomplet")}
            vide={t("suiviRc.videChart")}
            paysLabel={t("suiviRc.pays")}
          />
          <CarteChart
            titre={t("suiviRc.trialTitre")}
            desc={t("suiviRc.trialDesc")}
            brut={snap.charts.trial_conversion_rate}
            locale={i18n.language}
            incompleteLabel={t("suiviRc.incomplet")}
            extraMesures={["Trial Starts", "Conversions", "Pending"]}
            vide={t("suiviRc.videChart")}
            paysLabel={t("suiviRc.pays")}
          />
          <CarteChart
            titre={t("suiviRc.trialsJourTitre")}
            desc={t("suiviRc.trialsJourDesc")}
            brut={snap.charts.trials_new}
            locale={i18n.language}
            incompleteLabel={t("suiviRc.incomplet")}
            vide={t("suiviRc.videChart")}
            paysLabel={t("suiviRc.pays")}
          />
          <CartePerformanceCreateurs
            chart={normaliserChart(snap.charts.trials_new)}
            comptes={comptes.data ?? []}
            chargement={comptes.isPending}
          />
          <p className="text-xs text-muted-foreground">{t("suiviRc.noteIncomplet")}</p>
        </div>
      )}
    </div>
  );
}
