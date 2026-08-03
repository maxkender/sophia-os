import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlaskConical, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  annulerAssignationTestCompte,
  aujourdhuiParis,
  lancerAssignationTestCompte,
  listerComptes,
  listerPostsTestCompte,
  type AssignationTestLog,
} from "./api";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Assignation minuit en mode test pour UN créateur.
 * Pas de rattrapage ELO — posts `est_test` — rollback propre.
 * Stream NDJSON + logs (évite idle Edge 150s sur face swap / deck).
 */
export function SimulerMinuitCompteCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });
  const [date, setDate] = React.useState(aujourdhuiParis());
  const [compteId, setCompteId] = React.useState("");
  const [logs, setLogs] = React.useState<AssignationTestLog[]>([]);
  const logsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  const assigner = useMutation({
    mutationFn: () => {
      setLogs([]);
      return lancerAssignationTestCompte(date, compteId, (ligne) => {
        setLogs((prev) => [...prev, ligne]);
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts-test"] });
      void queryClient.invalidateQueries({ queryKey: ["posts-test-compte"] });
      void queryClient.invalidateQueries({ queryKey: ["suivi-minuit"] });
    },
  });

  const annuler = useMutation({
    mutationFn: () => annulerAssignationTestCompte(date, compteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts-test"] });
      void queryClient.invalidateQueries({ queryKey: ["posts-test-compte"] });
      void queryClient.invalidateQueries({ queryKey: ["suivi-minuit"] });
    },
  });

  const testsCompte = useQuery({
    queryKey: ["posts-test-compte", compteId, date],
    queryFn: () => listerPostsTestCompte(compteId, date),
    enabled: Boolean(compteId && date),
  });

  const crees = (assigner.data?.resultats ?? []).reduce((n, r) => n + (r.crees ?? 0), 0);
  const raison =
    assigner.data?.resultats?.[0]?.erreur ?? assigner.data?.resultats?.[0]?.raison ?? null;
  const postsCompte = testsCompte.data ?? [];

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          {t("simMinuitCompte.title")}
        </CardTitle>
        <CardDescription>{t("simMinuitCompte.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="testMinuitDate">{t("simMinuitCompte.date")}</Label>
            <Input
              id="testMinuitDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="testMinuitCompte">{t("simMinuitCompte.compte")}</Label>
            <select
              id="testMinuitCompte"
              className={selectClass}
              value={compteId}
              onChange={(e) => setCompteId(e.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {(comptes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.persona_nom ?? c.handle_tiktok ?? c.id.slice(0, 8)}
                  {c.langue ? ` · ${c.langue}` : ""}
                  {c.ugc_ai ? " · UGC" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!compteId || !date || assigner.isPending || annuler.isPending}
            onClick={() => assigner.mutate()}
          >
            {assigner.isPending ? t("simMinuitCompte.enCours") : t("simMinuitCompte.lancer")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!compteId || !date || annuler.isPending || assigner.isPending}
            onClick={() => {
              if (window.confirm(t("simMinuitCompte.annulerConfirm"))) annuler.mutate();
            }}
          >
            <RotateCcw className="mr-2 size-4" />
            {annuler.isPending ? t("simMinuitCompte.annulerEnCours") : t("simMinuitCompte.annuler")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t("simMinuitCompte.aide")}</p>

        {(assigner.isPending || logs.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("simMinuitCompte.logs")}
              {assigner.isPending ? ` — ${t("simMinuitCompte.enCours")}` : ""}
            </p>
            <div
              ref={logsRef}
              className="max-h-56 overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 && assigner.isPending && (
                <p className="text-muted-foreground">{t("simMinuitCompte.logsAttente")}</p>
              )}
              {logs.map((l, i) => (
                <p
                  key={`${l.at}-${i}`}
                  className={cn(
                    l.statut === "echec" && "text-destructive",
                    l.statut === "ok" && "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  <span className="text-muted-foreground">
                    {new Date(l.at).toLocaleTimeString()}
                  </span>{" "}
                  {l.detail}
                </p>
              ))}
            </div>
          </div>
        )}

        {assigner.isSuccess && (
          <div
            className={
              crees === 0
                ? "rounded-md bg-warning/10 p-3 text-sm text-warning"
                : "rounded-md bg-success/10 p-3 text-sm text-success"
            }
          >
            {crees === 0
              ? raison ?? t("simMinuitCompte.aucun")
              : t("simMinuitCompte.ok", { crees })}
          </div>
        )}
        {postsCompte.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {postsCompte.map((p) => (
              <Button key={p.id} size="sm" variant="outline" asChild>
                <Link to={`/admin/posts/${p.id}`}>{t("posts.ouvrir")}</Link>
              </Button>
            ))}
          </div>
        )}
        {assigner.isError && (
          <p className="text-sm text-destructive">{(assigner.error as Error).message}</p>
        )}
        {annuler.isSuccess && (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            {t("simMinuitCompte.annuleOk", {
              posts: annuler.data.posts,
              passages: annuler.data.passages,
            })}
          </div>
        )}
        {annuler.isError && (
          <p className="text-sm text-destructive">{(annuler.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
