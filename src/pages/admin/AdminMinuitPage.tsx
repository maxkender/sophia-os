import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarreChargement } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  aujourdhuiParis,
  diagnostiquerQuotaCompte,
  ecrireReglage,
  lancerAssignationJour,
  lancerAssignationJourLive,
  lancerRattrapageEloLive,
  lireMinuitDernierRun,
  lireReglages,
  suiviAssignation,
  type RattrapageEloBrief,
  type RattrapageEloLog,
  type SuiviMinuit,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

function fmtScore(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function fmtDelta(n: number): string {
  const s = fmtScore(n);
  return n > 0 ? `+${s}` : s;
}

function logLevelClass(level: RattrapageEloLog["level"]): string {
  if (level === "ok") return "text-emerald-700 dark:text-emerald-400";
  if (level === "warn") return "text-amber-700 dark:text-amber-400";
  if (level === "error") return "text-destructive";
  return "text-muted-foreground";
}

/** Brief + logs du dernier rattrapage ELO. */
function BriefRattrapageElo({
  brief,
  logs,
  erreurs,
}: {
  brief: RattrapageEloBrief;
  logs: RattrapageEloLog[];
  erreurs: Array<{ compteId: string; handle?: string | null; erreur: string }>;
}) {
  const { t } = useTranslation();
  const [logsOuverts, setLogsOuverts] = React.useState(true);
  const logsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!logsOuverts || !logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length, logsOuverts]);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">{t("minuit.rattrapageEloBriefTitre")}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{brief.resume}</p>
        <p className="mt-1 text-xs text-muted-foreground">{brief.fenetre}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border bg-background/60 p-2.5">
          <p className="text-xs font-medium text-muted-foreground">{t("minuit.rattrapageEloStats")}</p>
          <p className="mt-1 text-sm">
            {t("minuit.rattrapageEloReleves", { n: brief.stats.releves })}
            {" / "}
            {brief.passages}
          </p>
          {brief.stats.sansMatch > 0 && (
            <p className="text-xs text-warning">
              {t("minuit.rattrapageEloSansMatch", { n: brief.stats.sansMatch })}
            </p>
          )}
          {(brief.stats.fallbackUrl > 0 || brief.stats.fallbackCoherence > 0) && (
            <p className="text-xs text-muted-foreground">
              {t("minuit.rattrapageEloFallbacks", {
                url: brief.stats.fallbackUrl,
                coh: brief.stats.fallbackCoherence,
              })}
            </p>
          )}
        </div>
        <div className="rounded-md border bg-background/60 p-2.5">
          <p className="text-xs font-medium text-muted-foreground">{t("minuit.rattrapageEloLangues")}</p>
          <p className="mt-1 text-sm">
            {t("minuit.rattrapageEloDeltaNet", {
              delta: fmtDelta(brief.eloLangue.deltaNet),
              up: brief.eloLangue.hausses,
              down: brief.eloLangue.baisses,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {brief.eloLangue.appliques} ·{" "}
            {t("minuit.rattrapageEloIgnore", { n: brief.eloLangue.ignores })}
          </p>
        </div>
        <div className="rounded-md border bg-background/60 p-2.5">
          <p className="text-xs font-medium text-muted-foreground">{t("minuit.rattrapageEloComptes")}</p>
          <p className="mt-1 text-sm">
            {t("minuit.rattrapageEloMajComptes", { n: brief.eloCompte.maj })}
          </p>
        </div>
      </div>

      {brief.eloLangue.top.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {t("minuit.rattrapageEloTopLangues")}
          </p>
          <ul className="space-y-0.5 text-xs">
            {brief.eloLangue.top.map((d) => (
              <li key={d.passageId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium uppercase">{d.langue}</span>
                <span className="text-muted-foreground">
                  {d.handle ? `@${d.handle}` : d.compteId.slice(0, 8)}
                  {d.date ? ` · ${d.date}` : ""}
                </span>
                <span className={d.delta >= 0 ? "text-success" : "text-warning"}>
                  {fmtDelta(d.delta)} → {fmtScore(d.apres)}
                </span>
                <span className="text-muted-foreground">
                  {t("minuit.rattrapageEloVues", { n: d.vues })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.eloCompte.top.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {t("minuit.rattrapageEloTopComptes")}
          </p>
          <ul className="space-y-0.5 text-xs">
            {brief.eloCompte.top.map((c) => {
              const delta = c.apres - c.avant;
              return (
                <li key={c.compteId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {c.handle ? `@${c.handle}` : c.compteId.slice(0, 8)}
                  </span>
                  <span className={delta >= 0 ? "text-success" : "text-warning"}>
                    {fmtDelta(delta)} → {fmtScore(c.apres)}
                  </span>
                  <span className="text-muted-foreground">
                    {t("minuit.rattrapageEloPosts", { n: c.posts })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {erreurs.length > 0 && (
        <div className="space-y-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <p className="font-medium">{t("minuit.rattrapageEloErreurs")}</p>
          {erreurs.map((e) => (
            <p key={e.compteId}>
              {e.handle ? `@${e.handle}` : e.compteId.slice(0, 8)} — {e.erreur}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-md border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
          onClick={() => setLogsOuverts((v) => !v)}
        >
          <span className="font-medium">{t("minuit.rattrapageEloLogs")}</span>
          <span className="text-muted-foreground">
            {t("minuit.rattrapageEloLogsCount", { n: logs.length })}
          </span>
        </button>
        {logsOuverts && (
          <div
            ref={logsRef}
            className="max-h-64 space-y-1 overflow-y-auto border-t bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed"
          >
            {logs.map((l, i) => (
              <div key={`${l.at}-${i}`} className={cn("break-words", logLevelClass(l.level))}>
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
    </div>
  );
}

type CauseIncomplet =
  | { kind: "manquant"; manquants: number; faits: number; quota: number }
  | { kind: "echec"; postId: string; erreur: string | null }
  | { kind: "raisonAssign"; texte: string };

function causesCompteIncomplet(
  ligne: SuiviMinuit,
  raisonRelance?: string | null,
): CauseIncomplet[] {
  const causes: CauseIncomplet[] = [];
  const manquants = Math.max(0, ligne.quota - ligne.posts.length);
  if (manquants > 0) {
    causes.push({
      kind: "manquant",
      manquants,
      faits: ligne.posts.length,
      quota: ligne.quota,
    });
  }
  for (const p of ligne.posts) {
    if (p.pipeline_statut === "failed") {
      causes.push({
        kind: "echec",
        postId: p.id,
        erreur: p.pipeline_erreur,
      });
    }
  }
  if (raisonRelance) {
    causes.push({ kind: "raisonAssign", texte: raisonRelance });
  }
  return causes;
}

/** Charge le « pourquoi » réel (pool / labels / langue) pour un quota manquant. */
function PourquoiQuota({ compteId }: { compteId: string }) {
  const { t } = useTranslation();
  const diag = useQuery({
    queryKey: ["diag-quota", compteId],
    queryFn: () => diagnostiquerQuotaCompte(compteId),
    staleTime: 30_000,
  });
  if (diag.isPending) {
    return (
      <p className="text-[11px] text-muted-foreground">{t("minuit.causePourquoiChargement")}</p>
    );
  }
  if (diag.isError) {
    return (
      <p className="text-[11px] text-destructive">
        {(diag.error as Error).message}
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      <span className="font-medium text-foreground">{t("minuit.causePourquoiTitre")}</span>
      {" — "}
      {diag.data}
    </p>
  );
}

/** Un compteur en tête de page (comptes / prêts / en cours / échoués). */
function Tuile({
  icon: Icon,
  valeur,
  label,
  aide,
  ton,
  onClick,
  actif,
}: {
  icon: React.ComponentType<{ className?: string }>;
  valeur: number;
  label: string;
  aide?: string;
  ton: "neutre" | "ok" | "attente" | "echec";
  onClick?: () => void;
  actif?: boolean;
}) {
  const couleur = {
    neutre: "text-foreground",
    ok: "text-success",
    attente: "text-warning",
    echec: "text-destructive",
  }[ton];
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={aide}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-3 text-left",
        onClick && "transition-colors hover:bg-muted/40",
        onClick && valeur > 0 && "cursor-pointer",
        actif && "border-primary/50 bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      <Icon className={`size-5 shrink-0 ${couleur}`} />
      <div className="min-w-0">
        <p className={`text-xl font-semibold ${couleur}`}>{valeur}</p>
        <p className="text-xs text-muted-foreground">
          {label}
          {onClick && valeur > 0 ? " →" : ""}
        </p>
      </div>
    </Wrapper>
  );
}

export function AdminMinuitPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Jour Paris (comme Edge assignation / ELO) — pas le fuseau navigateur.
  const [date, setDate] = React.useState(aujourdhuiParis());

  const suivi = useQuery({
    queryKey: ["suivi-minuit", date],
    queryFn: () => suiviAssignation(date),
    // Rafraîchit tant qu'un post est en cours de fabrication, pour suivre en direct.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((l) =>
        l.posts.some((p) => p.pipeline_statut === "running" || p.pipeline_statut === "pending"),
      )
        ? 4000
        : false,
  });

  const reglages = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });
  const dernierRun = useQuery({
    queryKey: ["minuit-dernier-run"],
    queryFn: lireMinuitDernierRun,
  });
  const autoEnPause = reglages.data?.assignation_auto.actif === false;
  const vnextInactif = reglages.data?.moteur_vnext.actif === false;
  const [detailIncompletsOuvert, setDetailIncompletsOuvert] = React.useState(false);

  /**
   * Pause cron minuit / rattrapage auto — UNIQUEMENT via ce toggle.
   * Relancer / ELO refresh ne touchent JAMAIS assignation_auto.
   */
  const basculerPause = useMutation({
    mutationFn: (enPause: boolean) => ecrireReglage("assignation_auto", { actif: !enPause }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reglages"] }),
  });

  const [eloLive, setEloLive] = React.useState<{
    logs: RattrapageEloLog[];
    brief: RattrapageEloBrief | null;
    progress: string | null;
    erreurs: Array<{ compteId: string; handle?: string | null; erreur: string }>;
    done: boolean;
  }>({ logs: [], brief: null, progress: null, erreurs: [], done: false });

  const [phaseRelance, setPhaseRelance] = React.useState<"idle" | "elo" | "assignation">("idle");
  const phaseRelanceRef = React.useRef(phaseRelance);
  phaseRelanceRef.current = phaseRelance;

  const assignerUn = useMutation({
    mutationFn: (compteId: string) => lancerAssignationJour(date, compteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suivi-minuit", date] });
    },
  });

  function invaliderApresElo() {
    void queryClient.invalidateQueries({ queryKey: ["posters"] });
    void queryClient.invalidateQueries({ queryKey: ["comptes"] });
    // Analytics + Pilotage se nourrissent du même scrape / ELO compte.
    void queryClient.invalidateQueries({ queryKey: ["stats-comptes"] });
    void queryClient.invalidateQueries({ queryKey: ["stats-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["stats-posts-viraux"] });
    void queryClient.invalidateQueries({ queryKey: ["pilotage-dashboard"] });
  }

  async function executerEloRefresh() {
    setEloLive({
      logs: [],
      brief: null,
      progress: t("minuit.rattrapageEloEnCours"),
      erreurs: [],
      done: false,
    });
    const data = await lancerRattrapageEloLive({
      jours: 4,
      // Rejoue l'ELO langue sur les posts déjà scorés (vues du jour à jour).
      forcer: true,
      onProgress: (p) => {
        const label = p.handle
          ? t("minuit.rattrapageEloProgress", {
              i: p.index,
              n: p.total,
              handle: p.handle,
            })
          : t("minuit.rattrapageEloEnCours");
        setEloLive({
          logs: p.logs,
          brief: p.briefPartial,
          progress: label,
          erreurs: [],
          done: false,
        });
      },
    });
    setEloLive({
      logs: data.logs,
      brief: data.brief,
      progress: null,
      erreurs: data.stats.erreurs ?? [],
      done: true,
    });
    invaliderApresElo();
    return data;
  }

  /** Relancer = ELO refresh PUIS assignation manuelle. Ne change pas la pause auto. */
  const relancer = useMutation({
    mutationFn: async () => {
      setPhaseRelance("elo");
      // Ne throw pas sur timeouts partiels — continue compte par compte.
      await executerEloRefresh();
      setPhaseRelance("assignation");
      // Assignation aussi compte-par-compte (évite timeout Edge 150s).
      return lancerAssignationJourLive(date, {
        onProgress: (p) => {
          setEloLive((prev) => ({
            ...prev,
            progress: t("minuit.assignProgress", {
              i: p.index,
              n: p.total,
              nom: p.nom,
            }),
          }));
        },
      });
    },
    onSuccess: () => {
      setPhaseRelance("idle");
      setEloLive((prev) => ({ ...prev, progress: null }));
      void queryClient.invalidateQueries({ queryKey: ["suivi-minuit", date] });
      void queryClient.invalidateQueries({ queryKey: ["minuit-dernier-run"] });
      invaliderApresElo();
    },
    onError: (err) => {
      const enElo = phaseRelanceRef.current === "elo";
      setPhaseRelance("idle");
      setEloLive((prev) => ({
        ...prev,
        progress: null,
        done: false,
        logs: [
          ...prev.logs,
          {
            at: new Date().toISOString(),
            level: "error",
            message: enElo ? t("minuit.rattrapageEloErreur") : t("minuit.assignErreur"),
            detail: (err as Error).message,
          },
        ],
      }));
    },
  });

  /** ELO seul (sans assignation) — invalide aussi Analytics. */
  const rattrapageElo = useMutation({
    mutationFn: () => executerEloRefresh(),
    onError: (err) => {
      setEloLive((prev) => ({
        ...prev,
        progress: null,
        done: false,
        logs: [
          ...prev.logs,
          {
            at: new Date().toISOString(),
            level: "error",
            message: t("minuit.rattrapageEloErreur"),
            detail: (err as Error).message,
          },
        ],
      }));
    },
  });

  const lignes = suivi.data ?? [];
  const posts = lignes.flatMap((l) => l.posts);
  const prets = posts.filter((p) => p.pipeline_statut === "done").length;
  const enCours = posts.filter(
    (p) => p.pipeline_statut === "running" || p.pipeline_statut === "pending",
  ).length;
  const echoues = posts.filter((p) => p.pipeline_statut === "failed").length;

  // Comptes qui n'ont rien reçu (erreur dure ou pool vide expliqué).
  const erreursAssignation = (relancer.data?.resultats ?? []).filter(
    (r) => r.erreur || (r.crees === 0 && r.raison),
  );
  const raisonParCompte = new Map(
    erreursAssignation.map((r) => [r.compteId, r.erreur ?? r.raison ?? ""] as const),
  );

  const comptesIncomplets = lignes
    .filter(
      (l) => l.posts.some((p) => p.pipeline_statut === "failed") || l.posts.length < l.quota,
    )
    .map((l) => ({
      ligne: l,
      causes: causesCompteIncomplet(l, raisonParCompte.get(l.compteId) || null),
    }));
  const comptesEnEchec = comptesIncomplets.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("minuit.titre")}</CardTitle>
          <CardDescription>{t("minuit.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3",
              autoEnPause
                ? "border-warning/40 bg-warning/10"
                : "border-border bg-muted/20",
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="pauseMinuit" className="text-sm font-medium">
                {t("minuit.pauseToggle")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {autoEnPause ? t("minuit.pauseBanner") : t("minuit.pauseAide")}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                id="pauseMinuit"
                type="checkbox"
                className="size-4 accent-primary"
                checked={autoEnPause}
                disabled={basculerPause.isPending || reglages.isPending}
                onChange={(e) => basculerPause.mutate(e.target.checked)}
              />
              <span className={autoEnPause ? "font-medium text-warning" : "text-muted-foreground"}>
                {autoEnPause ? t("minuit.pauseOn") : t("minuit.pauseOff")}
              </span>
            </label>
          </div>

          {vnextInactif && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {t("minuit.vnextInactifBanner")}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("minuit.jour")}</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => suivi.refetch()}
              disabled={suivi.isFetching}
            >
              <RefreshCw className={`mr-2 size-4 ${suivi.isFetching ? "animate-spin" : ""}`} />
              {t("common.refresh")}
            </Button>
            <Button
              onClick={() => relancer.mutate()}
              disabled={relancer.isPending || rattrapageElo.isPending}
              title={t("minuit.relancerAide")}
            >
              {relancer.isPending
                ? phaseRelance === "elo"
                  ? t("minuit.rattrapageEloEnCours")
                  : t("minuit.enCours")
                : t("minuit.relancer")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => rattrapageElo.mutate()}
              disabled={rattrapageElo.isPending || relancer.isPending}
              title={t("minuit.rattrapageEloAide")}
            >
              {rattrapageElo.isPending ? t("minuit.rattrapageEloEnCours") : t("minuit.rattrapageElo")}
            </Button>
          </div>

          <BarreChargement
            actif={relancer.isPending || rattrapageElo.isPending}
            dureeMs={
              rattrapageElo.isPending || phaseRelance === "elo" ? 60_000 : 9_000
            }
            label={
              phaseRelance === "elo" || rattrapageElo.isPending
                ? (eloLive.progress ?? t("minuit.rattrapageEloEnCours"))
                : phaseRelance === "assignation"
                  ? t("minuit.enCours")
                  : t("minuit.enCours")
            }
          />

          {relancer.isSuccess && (() => {
            const crees = relancer.data.resultats.reduce((n, r) => n + r.crees, 0);
            const detailQuotas =
              relancer.data.avertissement ??
              (relancer.data.quotasBaisses?.length
                ? relancer.data.quotasBaisses
                    .map((q) => `${q.nom} ${q.avant}→${q.apres}`)
                    .join(" · ")
                : null);
            return (
              <div className="space-y-2">
                <div
                  className={
                    crees === 0
                      ? "rounded-md bg-warning/10 p-3 text-sm text-warning"
                      : "rounded-md bg-success/10 p-3 text-sm text-success"
                  }
                >
                  {crees === 0
                    ? t("minuit.lanceZero")
                    : t("minuit.lance", { crees })}
                </div>
                {detailQuotas && (
                  <div className="rounded-md bg-warning/10 p-3 text-sm text-warning">
                    {t("minuit.quotasBaisses", { detail: detailQuotas })}
                  </div>
                )}
              </div>
            );
          })()}
          {!relancer.isSuccess &&
            dernierRun.data?.avertissement &&
            dernierRun.data.jour === date && (
              <div className="rounded-md bg-warning/10 p-3 text-sm text-warning">
                {t("minuit.quotasBaissesDernier", {
                  detail: dernierRun.data.avertissement,
                })}
              </div>
            )}
          {relancer.isError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {(relancer.error as Error).message}
            </div>
          )}
          {(rattrapageElo.isPending || eloLive.done || eloLive.logs.length > 0) && (
            <div className="space-y-2">
              {rattrapageElo.isPending && eloLive.progress && (
                <p className="text-sm text-muted-foreground">{eloLive.progress}</p>
              )}
              {eloLive.brief ? (
                <BriefRattrapageElo
                  brief={eloLive.brief}
                  logs={eloLive.logs}
                  erreurs={eloLive.erreurs}
                />
              ) : eloLive.logs.length > 0 ? (
                <BriefRattrapageElo
                  brief={{
                    resume: eloLive.progress ?? t("minuit.rattrapageEloEnCours"),
                    fenetre: "…",
                    passages: 0,
                    stats: {
                      comptes: 0,
                      releves: 0,
                      sansMatch: 0,
                      fallbackUrl: 0,
                      fallbackCoherence: 0,
                      erreurs: 0,
                    },
                    eloLangue: {
                      appliques: 0,
                      ignores: 0,
                      deltaNet: 0,
                      hausses: 0,
                      baisses: 0,
                      top: [],
                    },
                    eloCompte: { maj: 0, top: [] },
                  }}
                  logs={eloLive.logs}
                  erreurs={[]}
                />
              ) : null}
            </div>
          )}
          {rattrapageElo.isError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {t("minuit.rattrapageEloErreur")} — {(rattrapageElo.error as Error).message}
            </div>
          )}
          {erreursAssignation.length > 0 && (
            <div className="space-y-1 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-medium">{t("minuit.erreursAssignation")}</p>
              {erreursAssignation.map((r) => (
                <p key={r.compteId}>
                  {lignes.find((l) => l.compteId === r.compteId)?.nom ?? r.compteId.slice(0, 8)} —{" "}
                  {r.erreur ?? r.raison}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tuile icon={CheckCircle2} valeur={prets} label={t("minuit.prets")} ton="ok" />
            <Tuile icon={Clock} valeur={enCours} label={t("minuit.enCoursLabel")} ton="attente" />
            <Tuile icon={AlertTriangle} valeur={echoues} label={t("minuit.echoues")} ton="echec" />
            <Tuile
              icon={AlertTriangle}
              valeur={comptesEnEchec}
              label={t("minuit.comptesIncomplets")}
              aide={t("minuit.comptesIncompletsAide")}
              ton={comptesEnEchec > 0 ? "echec" : "neutre"}
              actif={detailIncompletsOuvert}
              onClick={
                comptesEnEchec > 0
                  ? () => setDetailIncompletsOuvert((o) => !o)
                  : undefined
              }
            />
          </div>

          {detailIncompletsOuvert && comptesIncomplets.length > 0 && (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <p className="text-sm font-medium">{t("minuit.comptesIncompletsDetail")}</p>
                <p className="text-xs text-muted-foreground">{t("minuit.comptesIncompletsAide")}</p>
              </div>
              <ul className="space-y-2">
                {comptesIncomplets.map(({ ligne: l, causes }) => (
                  <li
                    key={l.compteId}
                    className="rounded-md border bg-background/80 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {l.avatar_url ? (
                            <img
                              src={l.avatar_url}
                              alt=""
                              className="size-7 rounded-full border object-cover"
                            />
                          ) : (
                            <div className="size-7 rounded-full border bg-muted" />
                          )}
                          <Link
                            to={`/admin/createurs/${l.compteId}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {l.nom}
                          </Link>
                          {l.handle && (
                            <span className="text-xs text-muted-foreground">
                              @{l.handle.replace(/^@/, "")}
                            </span>
                          )}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {nomLangue(l.langue)}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {t("minuit.faitSur", {
                              faits: l.posts.length,
                              quota: l.quota,
                            })}
                          </span>
                        </div>
                        <ul className="space-y-1 pl-9 text-xs">
                          {causes.map((c, i) => {
                            if (c.kind === "manquant") {
                              return (
                                <li key={`m-${i}`} className="space-y-1 text-warning">
                                  <p>
                                    <span className="font-medium">
                                      {t("minuit.causeManquantTitre")}
                                    </span>
                                    {" — "}
                                    {t("minuit.manquant", { count: c.manquants })}
                                    {" "}
                                    ({t("minuit.faitSur", {
                                      faits: c.faits,
                                      quota: c.quota,
                                    })})
                                  </p>
                                  <PourquoiQuota compteId={l.compteId} />
                                </li>
                              );
                            }
                            if (c.kind === "echec") {
                              return (
                                <li key={`e-${c.postId}`} className="text-destructive">
                                  <span className="font-medium">
                                    {t("minuit.causeEchecTitre")}
                                  </span>
                                  {" — "}
                                  {c.erreur?.trim() || t("minuit.causeEchecSansDetail")}
                                  {" · "}
                                  <Link
                                    to={`/admin/posts/${c.postId}`}
                                    className="underline underline-offset-2"
                                  >
                                    {t("minuit.voirPost")}
                                  </Link>
                                </li>
                              );
                            }
                            return (
                              <li key={`r-${i}`} className="text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {t("minuit.causeRaisonTitre")}
                                </span>
                                {" — "}
                                {c.texte}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          assignerUn.isPending ||
                          relancer.isPending ||
                          rattrapageElo.isPending
                        }
                        title={t("minuit.assignerUnAide")}
                        onClick={() => assignerUn.mutate(l.compteId)}
                      >
                        {assignerUn.isPending && assignerUn.variables === l.compteId
                          ? t("minuit.enCours")
                          : t("minuit.assignerUn")}
                      </Button>
                    </div>
                    {assignerUn.isError && assignerUn.variables === l.compteId && (
                      <p className="mt-2 pl-9 text-xs text-destructive">
                        {(assignerUn.error as Error).message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
