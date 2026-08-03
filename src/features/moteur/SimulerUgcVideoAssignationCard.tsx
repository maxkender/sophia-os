import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlaskConical, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  annulerAssignationUgcVideoTest,
  aujourdhuiParis,
  lancerAssignationUgcVideoTest,
  listerComptes,
  listerUgcVideoPostsTest,
  type AssignationTestLog,
} from "./api";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Mode = "complet" | "face_ref";

type Props = {
  /** `face_ref` = étapes 0–1 (reaction + Nano Banana) seulement. */
  mode?: Mode;
};

/** Test assignation UGC AI VIDEO — logs NDJSON exacts. */
export function SimulerUgcVideoAssignationCard({ mode = "complet" }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });
  const [date, setDate] = React.useState(aujourdhuiParis());
  const [compteId, setCompteId] = React.useState("");
  const [logs, setLogs] = React.useState<AssignationTestLog[]>([]);
  const logsRef = React.useRef<HTMLDivElement>(null);
  const i18nKey = mode === "face_ref" ? "simUgcVideoFace" : "simUgcVideo";

  const videoComptes = React.useMemo(
    () => (comptes.data ?? []).filter((c) => c.ugc_ai_video),
    [comptes.data],
  );

  React.useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  const assigner = useMutation({
    mutationFn: () => {
      setLogs([]);
      return lancerAssignationUgcVideoTest(
        date,
        compteId,
        (ligne) => {
          setLogs((prev) => [...prev, ligne]);
        },
        { jusquA: mode },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ugc-video-posts-test"] });
    },
  });

  const annuler = useMutation({
    mutationFn: () => annulerAssignationUgcVideoTest(date, compteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ugc-video-posts-test"] });
    },
  });

  const posts = useQuery({
    queryKey: ["ugc-video-posts-test", mode, compteId, date],
    queryFn: () => listerUgcVideoPostsTest(compteId, date),
    enabled: Boolean(compteId && date),
  });

  const crees = assigner.data?.crees ?? 0;
  const raison =
    assigner.data?.resultats?.[0]?.erreur ??
    assigner.data?.resultats?.[0]?.raison ??
    null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          {t(`${i18nKey}.title`)}
        </CardTitle>
        <CardDescription>{t(`${i18nKey}.subtitle`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`ugcVideoDate-${mode}`}>{t(`${i18nKey}.date`)}</Label>
            <Input
              id={`ugcVideoDate-${mode}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ugcVideoCompte-${mode}`}>{t(`${i18nKey}.compte`)}</Label>
            <select
              id={`ugcVideoCompte-${mode}`}
              className={selectClass}
              value={compteId}
              onChange={(e) => setCompteId(e.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {videoComptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.persona_nom ?? c.handle_tiktok ?? c.id.slice(0, 8)}
                  {c.langue ? ` · ${c.langue}` : ""}
                  {" · UGC VIDEO"}
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
            {assigner.isPending ? t(`${i18nKey}.enCours`) : t(`${i18nKey}.lancer`)}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!compteId || !date || annuler.isPending || assigner.isPending}
            onClick={() => {
              if (window.confirm(t(`${i18nKey}.annulerConfirm`))) annuler.mutate();
            }}
          >
            <RotateCcw className="mr-2 size-4" />
            {annuler.isPending ? t(`${i18nKey}.annulerEnCours`) : t(`${i18nKey}.annuler`)}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t(`${i18nKey}.aide`)}</p>

        {(assigner.isPending || logs.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t(`${i18nKey}.logs`)}
              {assigner.isPending ? ` — ${t(`${i18nKey}.enCours`)}` : ""}
            </p>
            <div
              ref={logsRef}
              className="max-h-72 overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 && assigner.isPending && (
                <p className="text-muted-foreground">{t(`${i18nKey}.logsAttente`)}</p>
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
              ? raison ?? t(`${i18nKey}.aucun`)
              : t(`${i18nKey}.ok`, { crees })}
          </div>
        )}

        {(posts.data ?? []).length > 0 && (
          <div className="space-y-3">
            {(posts.data ?? []).map((p) => (
              <div key={p.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="font-medium">{p.statut}</span>
                  <span className="text-muted-foreground">{p.id.slice(0, 8)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.frame_clean_url && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">frame10 clean</p>
                      <img
                        src={p.frame_clean_url}
                        alt=""
                        className="max-h-40 rounded border object-contain"
                      />
                    </div>
                  )}
                  {p.image_ref_url && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">face-ref</p>
                      <img
                        src={p.image_ref_url}
                        alt=""
                        className="max-h-40 rounded border object-contain"
                      />
                    </div>
                  )}
                </div>
                {mode === "complet" && p.video_finale_url && (
                  <video
                    src={p.video_finale_url}
                    controls
                    className="aspect-[9/16] max-h-64 w-auto rounded border"
                  />
                )}
                {mode === "complet" && p.caption && (
                  <pre className="whitespace-pre-wrap rounded border bg-background p-2 text-xs">
                    {p.caption}
                  </pre>
                )}
                {p.pipeline_erreur && (
                  <p className="text-xs text-destructive">{p.pipeline_erreur}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {assigner.isError && (
          <p className="text-sm text-destructive">{(assigner.error as Error).message}</p>
        )}
        {annuler.isSuccess && (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            {t(`${i18nKey}.annuleOk`, { posts: annuler.data.posts })}
          </div>
        )}
        {annuler.isError && (
          <p className="text-sm text-destructive">{(annuler.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
