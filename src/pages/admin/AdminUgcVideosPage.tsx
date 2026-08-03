import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Scissors, Trash2, Upload, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  finaliserUgcReaction,
  importerReactionTikTok,
  importerUtilisationFichier,
  listerUgcReactions,
  listerUgcUtilisations,
  supprimerUgcReaction,
  supprimerUgcUtilisation,
  uploadUgcReactionFichier,
  type UgcReaction,
} from "@/features/ugc/api";
import {
  extraireFrameTrim,
  normaliserTrim,
  trimmerVideo,
  trimPlein,
  type VideoTrim,
} from "@/features/ugc/videoCrop";

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m > 0 ? `${m}:${sec.toFixed(1).padStart(4, "0")}` : `${sec.toFixed(1)}s`;
}

export function AdminUgcVideosPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const liste = useQuery({
    queryKey: ["ugc-reactions"],
    queryFn: async () => (await listerUgcReactions()).reactions,
  });
  const utilisations = useQuery({
    queryKey: ["ugc-utilisations"],
    queryFn: async () => (await listerUgcUtilisations()).utilisations,
  });

  const [lien, setLien] = React.useState("");
  const [draft, setDraft] = React.useState<UgcReaction | null>(null);
  const [titre, setTitre] = React.useState("");
  const [dureeSec, setDureeSec] = React.useState(1);
  const [trim, setTrim] = React.useState<VideoTrim>(trimPlein(1));
  const [progress, setProgress] = React.useState<string | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = React.useState<string | null>(null);
  const [videoTextPreview, setVideoTextPreview] = React.useState<string | null>(null);

  const [titreUtil, setTitreUtil] = React.useState("");
  const [fichierUtil, setFichierUtil] = React.useState<File | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const peutTrim = draft?.statut === "brouillon";

  function ouvrirBrouillon(r: UgcReaction, duree?: number) {
    if (r.statut !== "brouillon") return;
    const d = duree ?? (r.duree_ms ? r.duree_ms / 1000 : 1);
    setDraft(r);
    setTitre(r.titre);
    setDureeSec(d);
    setTrim(trimPlein(d));
    setPreviewFrame(null);
    setVideoTextPreview(null);
    setLien(r.source_url);
    setErreur(null);
  }

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
      const d = r.duree_ms ? r.duree_ms / 1000 : 1;
      ouvrirBrouillon(r, d);
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
      if (!draft || draft.statut !== "brouillon") {
        throw new Error(t("ugc.videos.dejaFinalisee"));
      }
      const tNorm = normaliserTrim(trim, dureeSec);
      setProgress(t("ugc.videos.cropEnCours"));
      const cropped = await trimmerVideo(draft.video_source_url, tNorm, setProgress);

      setProgress(t("ugc.videos.frameEnCours"));
      const frameBlob = await extraireFrameTrim(draft.video_source_url, tNorm, 10);

      // Remplace l’original : un seul fichier `video.{ext}`
      const videoPath = `ugc/reactions/${draft.id}/video.${cropped.ext}`;
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
          crop: tNorm,
          videoPath: videoUp.path,
          videoUrl: videoUp.url,
          firstFramePath: frameUp.path,
          firstFrameUrl: frameUp.url,
          dureeMs: Math.round((tNorm.endSec - tNorm.startSec) * 1000),
        },
        setProgress,
      );
      setVideoTextPreview(reaction.video_text);
      return reaction;
    },
    onSuccess: (r) => {
      setDraft(null);
      setProgress(null);
      setPreviewFrame(r.first_frame_reference_url);
      setVideoTextPreview(r.video_text);
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

  const importUtil = useMutation({
    mutationFn: () => {
      if (!fichierUtil) throw new Error(t("ugc.videos.utilFichierRequis"));
      return importerUtilisationFichier(fichierUtil, titreUtil);
    },
    onMutate: () => {
      setErreur(null);
      setProgress(t("ugc.videos.utilUploadEnCours"));
    },
    onSuccess: () => {
      setProgress(null);
      setFichierUtil(null);
      setTitreUtil("");
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["ugc-utilisations"] });
    },
    onError: (e) => {
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const supprUtil = useMutation({
    mutationFn: (id: string) => supprimerUgcUtilisation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ugc-utilisations"] });
    },
  });

  const busy =
    importer.isPending ||
    finaliser.isPending ||
    importUtil.isPending ||
    supprimer.isPending ||
    supprUtil.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("ugc.videos.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ugc.videos.subtitle")}</p>
      </div>

      {/* ── Reactions ── */}
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

          {draft && peutTrim && (
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

              <TrimEditor
                videoUrl={draft.video_source_url}
                dureeSec={dureeSec}
                trim={trim}
                onDuree={(d) => {
                  setDureeSec((prev) => {
                    if (Math.abs(prev - d) < 0.05) return prev;
                    setTrim((tr) => normaliserTrim(tr, d));
                    return d;
                  });
                }}
                onChange={setTrim}
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
                  onClick={() => setTrim(trimPlein(dureeSec))}
                >
                  <Scissors />
                  {t("ugc.videos.resetCrop")}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("ugc.videos.trimRemplaceAide")}
              </p>
            </div>
          )}

          {(previewFrame || videoTextPreview) && !peutTrim && (
            <div className="grid gap-4 sm:grid-cols-2 rounded-lg border p-4">
              {previewFrame && (
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium text-muted-foreground">
                    first_frame_reference
                  </figcaption>
                  <img
                    src={previewFrame}
                    alt=""
                    className="max-h-64 w-auto rounded border object-contain"
                  />
                </figure>
              )}
              {videoTextPreview != null && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">video_text</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 text-xs">
                    {videoTextPreview || "—"}
                  </pre>
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

      {/* ── Utilisations ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4" />
            {t("ugc.videos.utilTitre")}
          </CardTitle>
          <CardDescription>{t("ugc.videos.utilDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="titreUtil">{t("ugc.videos.titreChamp")}</Label>
              <Input
                id="titreUtil"
                value={titreUtil}
                onChange={(e) => setTitreUtil(e.target.value)}
                placeholder={t("ugc.videos.utilTitrePlaceholder")}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fichierUtil">{t("ugc.videos.utilFichier")}</Label>
              <Input
                id="fichierUtil"
                ref={fileRef}
                type="file"
                accept="video/*"
                disabled={busy}
                onChange={(e) => setFichierUtil(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={busy || !fichierUtil}
            onClick={() => importUtil.mutate()}
          >
            {importUtil.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {t("ugc.videos.utilImporter")}
          </Button>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(utilisations.data ?? []).map((u) => (
              <Card key={u.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{u.titre}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            t("ugc.videos.confirmSuppr", { titre: u.titre }),
                          )
                        ) {
                          supprUtil.mutate(u.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </CardTitle>
                  <Badge variant="outline">utilisation</Badge>
                </CardHeader>
                <CardContent>
                  <video
                    src={u.video_url}
                    controls
                    className="aspect-[9/16] max-h-48 w-full rounded object-cover"
                  />
                  {u.nom_fichier && (
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {u.nom_fichier}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {utilisations.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("ugc.videos.utilListeVide")}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Liste reactions ── */}
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
                    disabled={busy}
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
                {r.statut === "pret" ? (
                  <video
                    src={r.video_source_url}
                    controls
                    className="aspect-[9/16] max-h-56 w-full rounded object-cover bg-black"
                  />
                ) : r.first_frame_reference_url ? (
                  <img
                    src={r.first_frame_reference_url}
                    alt=""
                    className="aspect-[9/16] max-h-48 w-full rounded object-cover"
                  />
                ) : (
                  <video
                    src={r.video_source_url}
                    className="aspect-[9/16] max-h-48 w-full rounded object-cover"
                    muted
                  />
                )}
                {r.video_text && (
                  <p className="line-clamp-3 text-xs text-muted-foreground">{r.video_text}</p>
                )}
                {r.statut === "brouillon" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    disabled={busy}
                    onClick={() => ouvrirBrouillon(r)}
                  >
                    {t("ugc.videos.continuerTrim")}
                  </Button>
                ) : (
                  <p className="text-center text-[10px] text-muted-foreground">
                    {t("ugc.videos.trimFige")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function TrimEditor({
  videoUrl,
  dureeSec,
  trim,
  onDuree,
  onChange,
  disabled,
}: {
  videoUrl: string;
  dureeSec: number;
  trim: VideoTrim;
  onDuree: (d: number) => void;
  onChange: (t: VideoTrim) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const tNorm = normaliserTrim(trim, dureeSec);
  const span = Math.max(0.05, tNorm.endSec - tNorm.startSec);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) onDuree(v.duration);
    };
    v.addEventListener("loadedmetadata", onMeta);
    if (v.readyState >= 1) onMeta();
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [videoUrl, onDuree]);

  function previewSegment() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = tNorm.startSec;
    void v.play();
    const stopAt = tNorm.endSec;
    const onTime = () => {
      if (v.currentTime >= stopAt) {
        v.pause();
        v.removeEventListener("timeupdate", onTime);
      }
    };
    v.addEventListener("timeupdate", onTime);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("ugc.videos.cropAide")}</p>
      <video
        ref={videoRef}
        src={videoUrl}
        className="mx-auto max-h-[360px] w-full max-w-[240px] rounded-lg border bg-black object-contain"
        controls
        playsInline
        crossOrigin="anonymous"
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("ugc.videos.trimDebut")} · {fmtSec(tNorm.startSec)}
          </span>
          <span className="font-medium text-foreground">
            {t("ugc.videos.trimDuree", { sec: span.toFixed(1) })}
          </span>
          <span>
            {t("ugc.videos.trimFin")} · {fmtSec(tNorm.endSec)}
          </span>
        </div>

        <Label className="text-xs">{t("ugc.videos.trimDebut")}</Label>
        <input
          type="range"
          min={0}
          max={Math.max(0.05, dureeSec - 0.05)}
          step={0.05}
          value={tNorm.startSec}
          disabled={disabled}
          className="w-full"
          onChange={(e) => {
            const startSec = Number(e.target.value);
            onChange(
              normaliserTrim(
                { startSec, endSec: Math.max(startSec + 0.05, tNorm.endSec) },
                dureeSec,
              ),
            );
            if (videoRef.current) videoRef.current.currentTime = startSec;
          }}
        />

        <Label className="text-xs">{t("ugc.videos.trimFin")}</Label>
        <input
          type="range"
          min={0.05}
          max={dureeSec || 0.05}
          step={0.05}
          value={tNorm.endSec}
          disabled={disabled}
          className="w-full"
          onChange={(e) => {
            const endSec = Number(e.target.value);
            onChange(
              normaliserTrim(
                { startSec: Math.min(tNorm.startSec, endSec - 0.05), endSec },
                dureeSec,
              ),
            );
            if (videoRef.current) videoRef.current.currentTime = endSec;
          }}
        />

        <div className="relative h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 bg-primary/80"
            style={{
              left: `${(tNorm.startSec / dureeSec) * 100}%`,
              width: `${(span / dureeSec) * 100}%`,
            }}
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={previewSegment}
        >
          {t("ugc.videos.trimPreview")}
        </Button>
      </div>
    </div>
  );
}
