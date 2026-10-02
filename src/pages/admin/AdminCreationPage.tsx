import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Pin, PinOff, RefreshCw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ELO_MANUEL_DEFAUT,
  SLIDES_MANUEL_MAX,
  SLIDES_MANUEL_MIN,
  genererSlideshowManuel,
  listerBiblioDuLabel,
  listerHooksDuLabel,
  listerImagesHookDuLabel,
  listerLabels,
  previewTiragesManuel,
  validerSlideshowManuel,
  type HookDuLabel,
  type MediaBiblioLabel,
  type SlideBrouillonManuel,
} from "@/features/moteur/api";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function GrilleImages({
  medias,
  selectedId,
  onPick,
  empty,
}: {
  medias: MediaBiblioLabel[];
  selectedId: string | null;
  onPick: (m: MediaBiblioLabel) => void;
  empty: string;
}) {
  if (medias.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {medias.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onPick(m)}
          className={cn(
            "overflow-hidden rounded-md border text-left",
            selectedId === m.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40",
          )}
        >
          <img src={m.url} alt="" className="aspect-[3/4] w-full object-cover" />
          {m.caption ? (
            <p className="line-clamp-2 px-1 py-0.5 text-[10px] text-muted-foreground">
              {m.caption}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function AdminCreationPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const labelFromUrl = params.get("label") ?? "";

  const [labelId, setLabelId] = React.useState(labelFromUrl);
  const [hookQuery, setHookQuery] = React.useState("");
  const [hookSel, setHookSel] = React.useState<HookDuLabel | null>(null);
  const [nbSlides, setNbSlides] = React.useState(6);
  const [elo, setElo] = React.useState(ELO_MANUEL_DEFAUT);
  const [promptExtra, setPromptExtra] = React.useState("");
  const [hookMediaId, setHookMediaId] = React.useState<string | null>(null);
  const [slides, setSlides] = React.useState<SlideBrouillonManuel[]>([]);
  const [pickerPos, setPickerPos] = React.useState<number | null>(null);
  const [contenuId, setContenuId] = React.useState<string | null>(null);

  const labels = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
  });
  const label = (labels.data ?? []).find((l) => l.id === labelId) ?? null;

  const hooks = useQuery({
    queryKey: ["creation-hooks", labelId],
    queryFn: () => listerHooksDuLabel(labelId),
    enabled: Boolean(labelId),
  });
  const imagesHook = useQuery({
    queryKey: ["creation-hook-images", labelId],
    queryFn: () => listerImagesHookDuLabel(labelId),
    enabled: Boolean(labelId),
  });
  const biblio = useQuery({
    queryKey: ["creation-biblio", labelId],
    queryFn: () => listerBiblioDuLabel(labelId, { exclureHook: true }),
    enabled: Boolean(labelId),
  });

  React.useEffect(() => {
    if (labelFromUrl && labelFromUrl !== labelId) setLabelId(labelFromUrl);
  }, [labelFromUrl, labelId]);

  function changerLabel(id: string) {
    setLabelId(id);
    setHookSel(null);
    setHookQuery("");
    setHookMediaId(null);
    setSlides([]);
    setContenuId(null);
    setPickerPos(null);
    const next = new URLSearchParams(params);
    if (id) next.set("label", id);
    else next.delete("label");
    setParams(next, { replace: true });
  }

  const hooksFiltres = React.useMemo(() => {
    const q = hookQuery.trim().toLowerCase();
    const list = hooks.data ?? [];
    if (!q) return list;
    return list.filter(
      (h) =>
        h.hook.toLowerCase().includes(q) ||
        (h.titre ?? "").toLowerCase().includes(q) ||
        (h.musiqueTitre ?? "").toLowerCase().includes(q),
    );
  }, [hooks.data, hookQuery]);

  function patchSlide(pos: number, patch: Partial<SlideBrouillonManuel>) {
    setSlides((prev) => prev.map((s) => (s.position === pos ? { ...s, ...patch } : s)));
  }

  function pinImage(pos: number, media: MediaBiblioLabel) {
    patchSlide(pos, {
      pinned: true,
      media_id: media.id,
      preview_media_id: media.id,
      preview_url: media.url,
      fallback: false,
      motif: "pinned",
    });
    if (pos === 1) setHookMediaId(media.id);
    setPickerPos(null);
  }

  const generer = useMutation({
    mutationFn: () => {
      if (!labelId || !hookSel) throw new Error(t("creation.hookRequis"));
      return genererSlideshowManuel({
        labelId,
        hook: hookSel.hook,
        nbSlides,
        promptExtra,
        hookMediaId,
      });
    },
    onSuccess: (data) => {
      setSlides(data);
      setContenuId(null);
      const hook = data.find((s) => s.position === 1);
      if (hook?.media_id) setHookMediaId(hook.media_id);
    },
  });

  const retirer = useMutation({
    mutationFn: () => {
      if (!labelId) throw new Error("label");
      return previewTiragesManuel(
        labelId,
        slides.map((s) =>
          s.pinned
            ? s
            : { ...s, preview_media_id: null, preview_url: null },
        ),
      );
    },
    onSuccess: (data) => setSlides(data),
  });

  const valider = useMutation({
    mutationFn: () => {
      if (!labelId || !hookSel) throw new Error(t("creation.hookRequis"));
      return validerSlideshowManuel({
        labelId,
        hook: hookSel.hook,
        hookContenuId: hookSel.contenuId,
        elo,
        langueSource: hookSel.langueSource,
        slides,
      });
    },
    onSuccess: (id) => {
      setContenuId(id);
      qc.invalidateQueries({ queryKey: ["slideshows"] });
    },
  });

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {t("creation.title")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("creation.subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("creation.parametres")}</CardTitle>
          <CardDescription>{t("creation.parametresDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="crea-label">{t("creation.label")}</Label>
              <select
                id="crea-label"
                className={selectClass}
                value={labelId}
                onChange={(e) => changerLabel(e.target.value)}
              >
                <option value="">{t("creation.choisirLabel")}</option>
                {(labels.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="crea-nb">{t("creation.nbSlides")}</Label>
                <Input
                  id="crea-nb"
                  type="number"
                  min={SLIDES_MANUEL_MIN}
                  max={SLIDES_MANUEL_MAX}
                  value={nbSlides}
                  onChange={(e) =>
                    setNbSlides(
                      Math.min(
                        SLIDES_MANUEL_MAX,
                        Math.max(SLIDES_MANUEL_MIN, Number(e.target.value) || SLIDES_MANUEL_MIN),
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="crea-elo">{t("creation.elo")}</Label>
                <Input
                  id="crea-elo"
                  type="number"
                  min={0}
                  max={100}
                  value={elo}
                  onChange={(e) =>
                    setElo(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                  }
                />
                <p className="text-[10px] text-muted-foreground">{t("creation.eloAide")}</p>
              </div>
            </div>
          </div>

          {label && (
            <p className="text-xs text-muted-foreground">
              {label.style_theme || label.prompt_creation
                ? t("creation.labelPrepare")
                : t("creation.labelVide")}{" "}
              <Link to="/admin" className="text-primary underline underline-offset-2">
                {t("creation.editerLabel")}
              </Link>
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="crea-extra">{t("creation.promptExtra")}</Label>
            <Textarea
              id="crea-extra"
              rows={2}
              value={promptExtra}
              onChange={(e) => setPromptExtra(e.target.value)}
              placeholder={t("creation.promptExtraPh")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("creation.hook")}</CardTitle>
          <CardDescription>{t("creation.hookDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={hookQuery}
            onChange={(e) => setHookQuery(e.target.value)}
            placeholder={t("creation.hookRecherche")}
            disabled={!labelId}
          />
          {!labelId ? (
            <p className="text-xs text-muted-foreground">{t("creation.dabordLabel")}</p>
          ) : hooks.isPending ? (
            <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
          ) : hooksFiltres.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("creation.hookVide")}</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
              {hooksFiltres.map((h) => (
                <button
                  key={h.contenuId}
                  type="button"
                  onClick={() => {
                    setHookSel(h);
                    setSlides([]);
                    setContenuId(null);
                  }}
                  className={cn(
                    "block w-full rounded px-2 py-1.5 text-left text-sm",
                    hookSel?.contenuId === h.contenuId
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="font-medium">{h.hook}</span>
                  {h.musiqueTitre ? (
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        hookSel?.contenuId === h.contenuId
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {t("creation.musique", { titre: h.musiqueTitre })}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium">{t("creation.imageHook")}</p>
            <p className="text-[11px] text-muted-foreground">{t("creation.imageHookAide")}</p>
            <GrilleImages
              medias={imagesHook.data ?? []}
              selectedId={hookMediaId}
              onPick={(m) => {
                setHookMediaId(m.id);
                if (slides.some((s) => s.position === 1)) pinImage(1, m);
              }}
              empty={t("creation.imageHookVide")}
            />
          </div>

          <Button
            disabled={!labelId || !hookSel || generer.isPending}
            onClick={() => generer.mutate()}
          >
            <Sparkles className="size-4" />
            {generer.isPending ? t("creation.generation") : t("creation.generer")}
          </Button>
          {generer.isError && (
            <p className="text-sm text-destructive">{(generer.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {slides.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{t("creation.apercu")}</CardTitle>
                <CardDescription>{t("creation.apercuDesc")}</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={retirer.isPending}
                onClick={() => retirer.mutate()}
              >
                <RefreshCw className={cn("size-4", retirer.isPending && "animate-spin")} />
                {t("creation.retirer")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {slides
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((s) => {
                const estHook = s.position === 1;
                const pool = estHook ? (imagesHook.data ?? []) : (biblio.data ?? []);
                return (
                  <div key={s.position} className="grid gap-3 rounded-md border p-3 md:grid-cols-[140px_1fr]">
                    <div className="space-y-2">
                      {s.preview_url ? (
                        <img
                          src={s.preview_url}
                          alt=""
                          className="aspect-[3/4] w-full rounded object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center rounded bg-muted text-[11px] text-muted-foreground">
                          {t("creation.sansImage")}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {estHook || s.pinned ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("creation.pinned")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {t("creation.critereLive")}
                          </Badge>
                        )}
                        {s.fallback && !s.pinned && !estHook ? (
                          <Badge variant="outline" className="text-[10px]">
                            {t("creation.fallback")}
                          </Badge>
                        ) : null}
                      </div>
                      {s.motif ? (
                        <p className="text-[10px] text-muted-foreground">{s.motif}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() =>
                            setPickerPos((p) => (p === s.position ? null : s.position))
                          }
                        >
                          {t("creation.changerImage")}
                        </Button>
                        {!estHook && s.pinned ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                              patchSlide(s.position, {
                                pinned: false,
                                media_id: null,
                              });
                            }}
                          >
                            <PinOff className="size-3.5" />
                            {t("creation.unpin")}
                          </Button>
                        ) : null}
                        {!estHook && !s.pinned && s.preview_media_id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() =>
                              patchSlide(s.position, {
                                pinned: true,
                                media_id: s.preview_media_id ?? null,
                              })
                            }
                          >
                            <Pin className="size-3.5" />
                            {t("creation.pin")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium">
                        {estHook
                          ? t("creation.slideHook")
                          : t("creation.slideN", { n: s.position })}
                      </p>
                      <Textarea
                        rows={3}
                        value={s.texte}
                        onChange={(e) => patchSlide(s.position, { texte: e.target.value })}
                      />
                      {!estHook ? (
                        <div className="space-y-1">
                          <Label className="text-xs">{t("creation.critere")}</Label>
                          <Input
                            value={s.critere}
                            onChange={(e) => patchSlide(s.position, { critere: e.target.value })}
                            placeholder={t("creation.criterePh")}
                          />
                        </div>
                      ) : null}
                      {pickerPos === s.position ? (
                        <GrilleImages
                          medias={pool}
                          selectedId={s.media_id ?? s.preview_media_id ?? null}
                          onPick={(m) => pinImage(s.position, m)}
                          empty={t("creation.biblioVide")}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}

            {retirer.isError && (
              <p className="text-sm text-destructive">{(retirer.error as Error).message}</p>
            )}
            {valider.isError && (
              <p className="text-sm text-destructive">{(valider.error as Error).message}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={valider.isPending} onClick={() => valider.mutate()}>
                <Check className="size-4" />
                {valider.isPending ? t("common.saving") : t("creation.valider")}
              </Button>
              {contenuId ? (
                <Link
                  to={`/admin/slideshows?id=${contenuId}`}
                  className="text-sm text-primary underline underline-offset-2"
                >
                  {t("creation.voirSlideshow")}
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
