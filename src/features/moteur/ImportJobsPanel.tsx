import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearImportJobsTermines,
  getImportJobs,
  subscribeImportJobs,
  type ImportJob,
  type ImportLogLevel,
} from "@/features/moteur/importJobs";
import { cn } from "@/lib/utils";

function levelClass(level: ImportLogLevel): string {
  if (level === "ok") return "text-emerald-700 dark:text-emerald-400";
  if (level === "warn") return "text-amber-700 dark:text-amber-400";
  if (level === "error") return "text-destructive";
  return "text-muted-foreground";
}

function JobRow({ job }: { job: ImportJob }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(job.statut === "encours");
  const logsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (job.statut === "encours") setOuvert(true);
  }, [job.statut]);

  React.useEffect(() => {
    if (!ouvert || !logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [job.logs.length, ouvert]);

  const statutVariant =
    job.statut === "encours" ? "warning" : job.statut === "ok" ? "success" : "destructive";

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setOuvert((v) => !v)}
      >
        <Badge variant={statutVariant}>
          {job.statut === "encours"
            ? t("sources.jobEncours")
            : job.statut === "ok"
              ? t("sources.jobOk")
              : t("sources.jobEchec")}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-medium">{job.titre}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {job.logs.length} {t("sources.jobLogs")}
        </span>
      </button>
      {ouvert && (
        <div
          ref={logsRef}
          className="max-h-56 space-y-1 overflow-y-auto border-t bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed"
        >
          {job.logs.length === 0 && (
            <p className="text-muted-foreground">{t("sources.jobLogsVides")}</p>
          )}
          {job.logs.map((l, i) => (
            <div key={`${l.at}-${i}`} className={cn("break-words", levelClass(l.level))}>
              <span className="opacity-60">
                {new Date(l.at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>{" "}
              <span className="font-sans font-medium">{l.message}</span>
              {l.detail && (
                <div className="pl-4 text-[10px] opacity-80 whitespace-pre-wrap">{l.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Panneau live des imports en arrière-plan (parallèles, non bloquants). */
export function ImportJobsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const jobs = React.useSyncExternalStore(subscribeImportJobs, getImportJobs, getImportJobs);
  const prevEncours = React.useRef(0);

  React.useEffect(() => {
    const encours = jobs.filter((j) => j.statut === "encours").length;
    if (prevEncours.current > 0 && encours < prevEncours.current) {
      void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
      void queryClient.invalidateQueries({ queryKey: ["contenus"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["historique-imports"] });
    }
    prevEncours.current = encours;
  }, [jobs, queryClient]);

  if (jobs.length === 0) return null;

  const encours = jobs.filter((j) => j.statut === "encours").length;
  const terminables = jobs.some((j) => j.statut !== "encours");

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("sources.jobsTitre")}</p>
          <p className="text-xs text-muted-foreground">
            {encours > 0
              ? t("sources.jobsEncoursServeur", { count: encours })
              : t("sources.jobsTermine")}
          </p>
        </div>
        {terminables && (
          <Button size="sm" variant="ghost" onClick={() => clearImportJobsTermines()}>
            {t("sources.jobsClear")}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
