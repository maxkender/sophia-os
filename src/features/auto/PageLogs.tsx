import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { localeDate } from "@/locales/localeDate";
import { BandeauDisputes } from "@/features/disputes/PageDisputes";
import { cn } from "@/lib/utils";

import { lireJournal, SOURCES_JOURNAL, type FiltreJournal, type LigneJournal, type SourceJournal } from "./api";
import { ajouterJours, filtrerActions, jourParis, versCsv } from "./logique";

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

const VARIANTE_RESULTAT: Record<string, "success" | "error" | "warning" | "info" | "secondary"> = {
  envoye: "success",
  fait: "success",
  ok: "success",
  paye: "success",
  erreur: "error",
  paused: "warning",
  a_verifier: "warning",
  simule: "info",
};

function telecharger(lignes: readonly LigneJournal[], nom: string) {
  const blob = new Blob([`\uFEFF${versCsv(lignes)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Logs (prompt 22, partie 10) : tout ce que l'automatisation a fait, une
 * ligne par action (heure, auteur, posteur, action, canal, résultat), filtres
 * par type, posteur et date, export CSV. Sources : auto_journal (0426). To do
 * et Issues sont dans « Needs you » (prompt 21, U).
 */
export function PageLogs() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const aujourdhui = jourParis();
  const [f, setF] = React.useState<FiltreJournal>(() => ({
    du: params.get("du") ?? ajouterJours(aujourdhui, -6),
    au: params.get("au") ?? aujourdhui,
    source: (SOURCES_JOURNAL as readonly string[]).includes(params.get("source") ?? "") ? (params.get("source") as SourceJournal) : "",
    poster: params.get("poster") ?? "",
  }));
  const [action, setAction] = React.useState(params.get("action") ?? "");
  // Les lignes d'avant restent affichées pendant la relecture (les posteurs du filtre ne disparaissent pas).
  const lu = useQuery({ queryKey: ["auto", "logs", f], queryFn: () => lireJournal(f), refetchInterval: 60_000, placeholderData: keepPreviousData });
  const lignes = filtrerActions(lu.data ?? [], action);
  const posteurs = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lu.data ?? []) if (l.poster_id) m.set(l.poster_id, l.poster_nom ?? l.poster_id);
    if (f.poster && !m.has(f.poster)) m.set(f.poster, f.poster);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lu.data, f.poster]);
  const quand = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  const maj = (champ: keyof FiltreJournal) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [champ]: e.target.value });

  return (
    <div className="space-y-4" data-testid="page-logs">
      <BandeauDisputes />
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClass} aria-label={t("auto.logs.filtres.type")} value={f.source} onChange={maj("source")}>
          <option value="">{t("auto.logs.filtres.tousTypes")}</option>
          {SOURCES_JOURNAL.map((s) => (
            <option key={s} value={s}>
              {t(`auto.logs.sources.${s}`)}
            </option>
          ))}
        </select>
        <select className={selectClass} aria-label={t("auto.logs.filtres.posteur")} value={f.poster} onChange={maj("poster")}>
          <option value="">{t("auto.logs.filtres.tousPosteurs")}</option>
          {posteurs.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </select>
        <Input type="date" className="h-9 w-40" aria-label={t("auto.logs.filtres.du")} value={f.du} max={f.au} onChange={maj("du")} />
        <Input type="date" className="h-9 w-40" aria-label={t("auto.logs.filtres.au")} value={f.au} min={f.du} onChange={maj("au")} />
        {action && (
          <Button size="sm" variant="secondary" data-testid="filtre-action" onClick={() => setAction("")}>
            {action
              .split(",")
              .map((a) => t(`auto.today.types.${a}`, { defaultValue: a }))
              .join(" · ")}{" "}
            ✕
          </Button>
        )}
        <span className="text-sm text-muted-foreground" data-testid="logs-compteur">
          {t("auto.logs.compteur", { count: lignes.length })}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={lignes.length === 0}
          onClick={() => telecharger(lignes, `logs_${f.du}_${f.au}.csv`)}
        >
          <Download className="size-4" />
          {t("auto.logs.csv")}
        </Button>
      </div>
      {(lu.data?.length ?? 0) >= 1000 && <p className="text-xs text-muted-foreground">{t("auto.logs.limite")}</p>}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
          <table className="w-full min-w-[820px] border-collapse text-sm" data-testid="logs-table">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">{t("auto.logs.col.heure")}</th>
                <th className="px-2 py-1.5 font-medium">{t("auto.logs.col.auteur")}</th>
                <th className="px-2 py-1.5 font-medium">{t("auto.logs.col.posteur")}</th>
                <th className="px-2 py-1.5 font-medium">{t("auto.logs.col.action")}</th>
                <th className="px-2 py-1.5 font-medium">{t("auto.logs.col.canal")}</th>
                <th className="px-2 py-1.5 font-medium">{t("auto.logs.col.resultat")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lignes.map((l, i) => (
                <tr key={`${l.at}-${l.source}-${i}`} data-source={l.source} className="align-top">
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">{quand.format(new Date(l.at))}</td>
                  <td className="px-2 py-1.5">{l.auteur}</td>
                  <td className="px-2 py-1.5">{l.poster_nom ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{t(`auto.logs.sources.${l.source}`)}</span>{" "}
                    <span>{t(`auto.today.types.${l.action}`, { defaultValue: t(`pipeline.evenements.${l.action}`, { defaultValue: l.action }) })}</span>
                    {l.detail && <span className="block max-w-xl truncate text-xs text-muted-foreground" title={l.detail}>{l.detail}</span>}
                  </td>
                  <td className="px-2 py-1.5">{l.canal ? t(`auto.logs.canaux.${l.canal}`, { defaultValue: l.canal }) : "—"}</td>
                  <td className={cn("px-2 py-1.5")}>
                    {l.resultat ? (
                      <Badge variant={VARIANTE_RESULTAT[l.resultat] ?? "secondary"} data-resultat={l.resultat}>
                        {t(`auto.logs.resultats.${l.resultat}`, { defaultValue: l.resultat })}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lu.data && lignes.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("auto.logs.vide")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
