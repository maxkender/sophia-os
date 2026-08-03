import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Scissors, Trash2, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  finaliserUgcReaction,
  importerReactionTikTok,
  listerUgcReactions,
  supprimerUgcReaction,
  uploadUgcReactionFichier,
  type UgcReaction,
} from "@/features/ugc/api";
import {
  CROP_PLEIN,
  cropperVideo,
  extraireFrameCroppee,
  normaliserCrop,
  type CropRect,
} from "@/features/ugc/videoCrop";
import { cn } from "@/lib/utils";

export function AdminUgcVideosPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const liste = useQuery({
    queryKey: ["ugc-reactions"],
    queryFn: async () => (await listerUgcReactions()).reactions,
  });

  const [lien, setLien] = React.useState("");
  const [draft, setDraft] = React.useState<UgcReaction | null>(null);
  const [titre, setTitre] = React.useState("");
  const [crop, setCrop] = React.useState<CropRect>(CROP_PLEIN);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = React.useState<string | null>(null);
  const [videoTextPreview, setVideoTextPreview] = React.useState<string | null>(null);

  const importer = useMutation({
    mutationFn: () => importerReactionTikTok(lien.trim(), setProgress),
    onMutate: () => {
      setErreur(null);
      setProgress(t("ugc.videos.importEnCours"));
      setDraft(null);
      setPreviewFrame(null);
      setVideoTextPreview(null);
    },
    onSuccess: (r) => {
      setDraft(r);
      setTitre(r.titre);
      setCrop(CROP_PLEIN);
      setProgress(null);
      void queryClient.invalidateQueries({ queryKey: ["ugc-reactions"] });
    },
    onError: (e) => {
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const finaliser = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Draft manquant");
      const c = normaliserCrop(crop);
      setProgress(t("ugc.videos.cropEnCours"));
      const cropped = await cropperVideo(draft.video_source_url, c, setProgress);

      setProgress(t("ugc.videos.frameEnCours"));
      const frameBlob = await extraireFrameCroppee(draft.video_source_url, c, 10);

      const videoPath = `ugc/reactions/${draft.id}/crop.${cropped.ext}`;
      const framePath = `ugc/reactions/${draft.id}/first_frame_reference.jpg`;

      setProgress(t("ugc.videos.uploadEnCours"));
      const videoUp = await uploadUgcReactionFichier(
        videoPath,
        cropped.blob,
        cropped.mime,
      );
      const frameUp = await uploadUgcReactionFichier(
        framePath,
        frameBlob,
        "image/jpeg",
      );
      setPreviewFrame(frameUp.url);

      setProgress(t("ugc.videos.ocrEnCours"));
      const reaction = await finaliserUgcReaction(
        {
          id: draft.id,
          titre: titre.trim() || draft.titre,
          crop: c,
          videoPath: videoUp.path,
          videoUrl: videoUp.url,
          firstFramePath: frameUp.path,
          firstFrameUrl: frameUp.url,
        },
        setProgress,
      );
      setVideoTextPreview(reaction.video_text);
      return reaction;
    },
    onSuccess: (r) => {
      setDraft(r);
      setProgress(null);
      void queryClient.invalidateQueries({ queryKey: ["ugc-reactions"] });
    },
    onError: (e) => {
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerUgcReaction(id),
    onSuccess: (_d, id) => {
      if (draft?.id === id) {
        setDraft(null);
        setPreviewFrame(null);
        setVideoTextPreview(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["ugc-reactions"] });
    },
  });

  const busy = importer.isPending || finaliser.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("ugc.videos.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ugc.videos.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="size-4" />
            {t("ugc.videos.importTitre")}
          </CardTitle>
          <CardDescription>{t("ugc.videos.importDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label htmlFor="tiktokUrl">{t("ugc.videos.lien")}</Label>
              <Input
                id="tiktokUrl"
                value={lien}
                onChange={(e) => setLien(e.target.value)}
                placeholder="https://www.tiktok.com/@…/video/…"
                disabled={busy}
              />
            </div>
            <Button
              type="button"
              disabled={busy || !lien.trim()}
              onClick={() => importer.mutate()}
            >
              {importer.isPending ? <Loader2 className="animate-spin" /> : <Video />}
              {t("ugc.videos.importer")}
            </Button>
          </div>

          {draft && (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{draft.statut}</Badge>
                {draft.tiktok_post_id && (
                  <span className="text-xs text-muted-foreground">
                    #{draft.tiktok_post_id}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="titreReaction">{t("ugc.videos.titreChamp")}</Label>
                <Input
                  id="titreReaction"
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  disabled={busy}
                />
              </div>

              <CropEditor
                videoUrl={draft.video_source_url}
                crop={crop}
                onChange={setCrop}
                disabled={busy}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => finaliser.mutate()}
                >
                  {finaliser.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  {t("ugc.videos.validerEnregistrer")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCrop(CROP_PLEIN)}
                >
                  <Scissors />
                  {t("ugc.videos.resetCrop")}
                </Button>
              </div>

              {(previewFrame || draft.first_frame_reference_url) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <figure className="space-y-1">
                    <figcaption className="text-xs font-medium text-muted-foreground">
                      first_frame_reference
                    </figcaption>
                    <img
                      src={previewFrame || draft.first_frame_reference_url!}
                      alt=""
                      className="max-h-64 w-auto rounded border object-contain"
                    />
                  </figure>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">video_text</p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 text-xs">
                      {videoTextPreview ?? draft.video_text ?? "—"}
                    </pre>
                  </div>
                </div>
              )}

              {draft.video_url && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("ugc.videos.videoCroppee")}
                  </p>
                  <video
                    src={draft.video_url}
                    controls
                    className="max-h-80 w-full rounded border bg-black"
                  />
                </div>
              )}
            </div>
          )}

          {progress && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {progress}
            </p>
          )}
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("ugc.videos.listeTitre")}</h2>
        {liste.isPending && (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
        {liste.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("ugc.videos.listeVide")}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(liste.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.titre || r.id.slice(0, 8)}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={supprimer.isPending || busy}
                    onClick={() => {
                      if (window.confirm(t("ugc.videos.confirmSuppr", { titre: r.titre }))) {
                        supprimer.mutate(r.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardTitle>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={r.statut === "pret" ? "success" : "secondary"}>
                    {r.statut}
                  </Badge>
                  <Badge variant="outline">reactions</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(r.first_frame_reference_url || r.video_url || r.video_source_url) && (
                  r.first_frame_reference_url ? (
                    <img
                      src={r.first_frame_reference_url}
                      alt=""
                      className="aspect-[9/16] max-h-48 w-full rounded object-cover"
                    />
                  ) : (
                    <video
                      src={r.video_url || r.video_source_url}
                      className="aspect-[9/16] max-h-48 w-full rounded object-cover"
                      muted
                    />
                  )
                )}
                {r.video_text && (
                  <p className="line-clamp-3 text-xs text-muted-foreground">{r.video_text}</p>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  disabled={busy}
                  onClick={() => {
                    setDraft(r);
                    setTitre(r.titre);
                    setCrop(r.crop ?? CROP_PLEIN);
                    setPreviewFrame(r.first_frame_reference_url);
                    setVideoTextPreview(r.video_text);
                    setLien(r.source_url);
                  }}
                >
                  {t("ugc.videos.rouvrir")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function CropEditor({
  videoUrl,
  crop,
  onChange,
  disabled,
}: {
  videoUrl: string;
  crop: CropRect;
  onChange: (c: CropRect) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const drag = React.useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    origin: CropRect;
  } | null>(null);

  const c = normaliserCrop(crop);

  function onPointerDown(
    e: React.PointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...c },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || disabled) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - drag.current.startX) / rect.width;
    const dy = (e.clientY - drag.current.startY) / rect.height;
    const o = drag.current.origin;

    if (drag.current.mode === "move") {
      onChange(
        normaliserCrop({
          x: o.x + dx,
          y: o.y + dy,
          w: o.w,
          h: o.h,
        }),
      );
      return;
    }

    let { x, y, w, h } = o;
    if (drag.current.mode.includes("w")) {
      const nx = clamp(o.x + dx);
      w = o.w + (o.x - nx);
      x = nx;
    }
    if (drag.current.mode.includes("e")) {
      w = o.w + dx;
    }
    if (drag.current.mode.includes("n")) {
      const ny = clamp(o.y + dy);
      h = o.h + (o.y - ny);
      y = ny;
    }
    if (drag.current.mode.includes("s")) {
      h = o.h + dy;
    }
    onChange(normaliserCrop({ x, y, w, h }));
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("ugc.videos.cropAide")}</p>
      <div
        ref={wrapRef}
        className="relative mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden rounded-lg border bg-black select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-contain"
          controls
          playsInline
          crossOrigin="anonymous"
        />
        {/* Overlay assombri hors crop */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute bg-black/50"
            style={{ left: 0, top: 0, right: 0, height: `${c.y * 100}%` }}
          />
          <div
            className="absolute bg-black/50"
            style={{
              left: 0,
              top: `${(c.y + c.h) * 100}%`,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="absolute bg-black/50"
            style={{
              left: 0,
              top: `${c.y * 100}%`,
              width: `${c.x * 100}%`,
              height: `${c.h * 100}%`,
            }}
          />
          <div
            className="absolute bg-black/50"
            style={{
              left: `${(c.x + c.w) * 100}%`,
              top: `${c.y * 100}%`,
              right: 0,
              height: `${c.h * 100}%`,
            }}
          />
        </div>
        <div
          className={cn(
            "absolute border-2 border-primary",
            disabled ? "pointer-events-none" : "cursor-move",
          )}
          style={{
            left: `${c.x * 100}%`,
            top: `${c.y * 100}%`,
            width: `${c.w * 100}%`,
            height: `${c.h * 100}%`,
          }}
          onPointerDown={(e) => onPointerDown(e, "move")}
        >
          {(["nw", "ne", "sw", "se"] as const).map((corner) => (
            <span
              key={corner}
              onPointerDown={(e) => onPointerDown(e, corner)}
              className={cn(
                "absolute size-3 rounded-sm bg-primary",
                corner[0] === "n" ? "-top-1.5" : "-bottom-1.5",
                corner[1] === "w" ? "-left-1.5" : "-right-1.5",
                corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
              )}
            />
          ))}
        </div>
      </div>
      <p className="text-center font-mono text-[10px] text-muted-foreground">
        x={c.x.toFixed(2)} y={c.y.toFixed(2)} w={c.w.toFixed(2)} h={c.h.toFixed(2)}
      </p>
    </div>
  );
}

function clamp(n: number) {
  return Math.min(1, Math.max(0, n));
}
