import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listerUgcPersonas, listerUgcReactions } from "@/features/ugc/api";
import { cn } from "@/lib/utils";

import {
  lancerTestFaceSwapVideo,
  type AssignationTestLog,
  type TestFaceSwapVideoResultat,
} from "./api";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Test isolé : persona + vidéo référence → face swap Kling. Rien d’autre. */
export function TestFaceSwapVideoCard() {
  const { t } = useTranslation();
  const [personaId, setPersonaId] = React.useState("");
  const [reactionId, setReactionId] = React.useState("");
  const [logs, setLogs] = React.useState<AssignationTestLog[]>([]);
  const [resultat, setResultat] = React.useState<TestFaceSwapVideoResultat | null>(
    null,
  );
  const logsRef = React.useRef<HTMLDivElement>(null);

  const personas = useQuery({
    queryKey: ["ugc-personas"],
    queryFn: async () => (await listerUgcPersonas()).personas,
  });
  const reactions = useQuery({
    queryKey: ["ugc-reactions"],
    queryFn: async () => (await listerUgcReactions()).reactions,
  });

  const personasOk = React.useMemo(
    () => (personas.data ?? []).filter((p) => p.image_face_url),
    [personas.data],
  );
  const reactionsOk = React.useMemo(
    () =>
      (reactions.data ?? []).filter(
        (r) => r.video_source_url && r.statut !== "archive",
      ),
    [reactions.data],
  );

  const persona = personasOk.find((p) => p.id === personaId) ?? null;
  const reaction = reactionsOk.find((r) => r.id === reactionId) ?? null;

  React.useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  const lancer = useMutation({
    mutationFn: () => {
      setLogs([]);
      setResultat(null);
      return lancerTestFaceSwapVideo(personaId, reactionId, (ligne) => {
        setLogs((prev) => [...prev, ligne]);
      });
    },
    onSuccess: (r) => setResultat(r),
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          {t("simFaceSwapVideo.title")}
        </CardTitle>
        <CardDescription>{t("simFaceSwapVideo.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="faceSwapPersona">{t("simFaceSwapVideo.persona")}</Label>
            <select
              id="faceSwapPersona"
              className={selectClass}
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {personasOk.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {persona?.image_face_url && (
              <img
                src={persona.image_face_url}
                alt=""
                className="max-h-40 rounded border object-contain"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="faceSwapVideo">{t("simFaceSwapVideo.video")}</Label>
            <select
              id="faceSwapVideo"
              className={selectClass}
              value={reactionId}
              onChange={(e) => setReactionId(e.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {reactionsOk.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.titre || r.id.slice(0, 8)}
                  {r.statut === "pret" ? "" : ` · ${r.statut}`}
                </option>
              ))}
            </select>
            {reaction?.video_source_url && (
              <video
                src={reaction.video_source_url}
                controls
                poster={reaction.first_frame_reference_url ?? undefined}
                className="aspect-[9/16] max-h-48 w-auto rounded border"
              />
            )}
          </div>
        </div>

        <Button
          type="button"
          disabled={!personaId || !reactionId || lancer.isPending}
          onClick={() => lancer.mutate()}
        >
          {lancer.isPending
            ? t("simFaceSwapVideo.enCours")
            : t("simFaceSwapVideo.lancer")}
        </Button>

        <p className="text-xs text-muted-foreground">{t("simFaceSwapVideo.aide")}</p>

        {(lancer.isPending || logs.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("simFaceSwapVideo.logs")}
              {lancer.isPending ? ` — ${t("simFaceSwapVideo.enCours")}` : ""}
            </p>
            <div
              ref={logsRef}
              className="max-h-72 overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 && lancer.isPending && (
                <p className="text-muted-foreground">
                  {t("simFaceSwapVideo.logsAttente")}
                </p>
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

        {resultat?.videoUrl && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm text-success">{t("simFaceSwapVideo.ok")}</p>
            <video
              src={resultat.videoUrl}
              controls
              className="aspect-[9/16] max-h-80 w-auto rounded border"
            />
          </div>
        )}

        {lancer.isError && (
          <p className="text-sm text-destructive">
            {(lancer.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
