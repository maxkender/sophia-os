import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ImageUp, RefreshCw, Sparkles, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { NettoyageEtapes } from "@/components/moteur/NettoyageEtapes";
import { UpscaleMediaControl } from "@/components/moteur/UpscaleMediaControl";
import { LabelEditor } from "@/features/moteur/LabelPicker";
import {
  labelsDuContenu,
  lireReglages,
  lireSlideshow,
  listerContenus,
  jobsReimportDepuisSlides,
  listerJobsReimportPhotosValides,
  listerMediasPourContenu,
  majMediaSlideContenu,
  renettoyerSlideContenu,
  renseignerLienPublie,
  setLabelsContenu,
  supprimerContenu,
  type ContenuListe,
  type JobReimportPhoto,
  type SlideshowDetail,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
  type ProviderNettoyage,
} from "@/features/moteur/nettoyageEtapes";
import { nomLangue } from "@/features/moteur/langues";
import type { ContenuLangue, ContenuSlide, Media } from "@/features/moteur/types";
import { AGENTS_REIMPORT_PHOTOS, executerEnLot } from "@/lib/lot";
import { cn } from "@/lib/utils";

function PassageLien({
  passageId,
  postId,
  publieUrl,
  statut,
  contenuId,
}: {
  passageId: string;
  postId: string | null;
  publieUrl: string | null;
  statut: string;
  contenuId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const peutEditer = statut === "publie";
  const [edit, setEdit] = React.useState(peutEditer && !publieUrl);
  const [url, setUrl] = React.useState(publieUrl ?? "");
  const save = useMutation({
    mutationFn: () => renseignerLienPublie({ passageId, postId }, url),
    onSuccess: () => {
      setEdit(false);
      void queryClient.invalidateQueries({ queryKey: ["slideshow", contenuId] });
      void queryClient.invalidateQueries({ queryKey: ["publications-compte"] });
    },
  });

  if (!peutEditer && !publieUrl) return null;

  if (!edit && publieUrl) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <a
          href={publieUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          TikTok ↗
        </a>
        {peutEditer && (
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2"
            onClick={() => {
              setUrl(publieUrl);
              setEdit(true);
            }}
          >
            {t("slideshows.modifierLien")}
          </button>
        )}
      </div>
    );
  }

  if (!edit) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("slideshows.lienPlaceholder")}
        className="h-7 min-w-[12rem] flex-1 text-xs"
      />
      <Button
        size="sm"
        className="h-7"
        disabled={save.isPending || !url.trim()}
        onClick={() => save.mutate()}
      >
        {save.isPending ? t("common.saving") : t("common.save")}
      </Button>
      {publieUrl && (
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(false)}>
          {t("common.cancel")}
        </Button>
      )}
    </div>
  );
}

function urlPropre(c: ContenuListe, slide: ContenuSlide): string | null {
  if (slide.media_id && c.mediaUrls?.[slide.media_id]) return c.mediaUrls[slide.media_id];
  return null;
}

function vignette(c: ContenuListe): string | null {
  const slides = [...(c.structure_slides ?? [])].sort((a, b) => a.position - b.position);
  for (const s of slides) {
    const propre = urlPropre(c, s);
    if (propre) return propre;
  }
  const first = slides[0];
  return first?.raw_url ?? first?.reference_url ?? null;
}

function DeckLangue({
  contenu,
  langue,
  estSource,
}: {
  contenu: SlideshowDetail;
  langue: ContenuLangue;
  estSource: boolean;
}) {
  const { t } = useTranslation();
  const structure = [...(contenu.structure_slides ?? [])].sort((a, b) => a.position - b.position);
  const aPassage = contenu.passages.some((p) => p.langue === langue.langue);
  const aTexteLangue = (langue.slides ?? []).some((s) => s.texte_overlay?.trim());
  const sourceCl = contenu.langues.find((l) => l.langue === contenu.langue_source);
  // Pas encore de passage sur cette langue → on montre le texte OCR d'origine
  // (stocké à l'import, sans pub Sophia). Traduction + Sophia = à l'assignation.
  const montrerOriginel = !aPassage || (!estSource && !aTexteLangue);
  const slidesTexte = montrerOriginel
    ? (sourceCl?.slides ?? [])
    : (langue.slides ?? []);
  const textes = new Map(slidesTexte.map((s) => [s.position, s] as const));

  if (structure.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("slideshows.deckVide")}</p>;
  }

  return (
    <div className="space-y-2">
      {montrerOriginel ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
          {t("slideshows.pasEncorePassage", { langue: nomLangue(langue.langue) })}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {estSource ? t("slideshows.deckSourceAide") : t("slideshows.deckTradAide")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {structure.map((s) => {
          const img = urlPropre(contenu, s) ?? s.raw_url ?? s.reference_url;
          const meta = textes.get(s.position);
          const texte = meta?.texte_overlay?.trim() || null;
          const sophia = !montrerOriginel && Boolean(meta?.position_sophia);
          return (
            <div key={s.position} className="overflow-hidden rounded border">
              {img ? (
                <img src={img} alt="" className="aspect-[3/4] w-full object-cover" />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center bg-muted text-[10px] text-muted-foreground">
                  #{s.position}
                </div>
              )}
              <div className="space-y-1 p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground">#{s.position}</span>
                  {sophia && (
                    <Badge variant="success" className="text-[10px]">
                      Sophia
                    </Badge>
                  )}
                  {montrerOriginel && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("slideshows.texteOriginel")}
                    </Badge>
                  )}
                </div>
                {texte ? (
                  <p className="text-xs leading-snug">{texte}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t("slideshows.sansTexte")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SelecteurMediaContenu({
  medias,
  onChoisir,
  onFermer,
}: {
  medias: Media[];
  onChoisir: (mediaId: string) => void;
  onFermer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded border bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{t("slideshows.choisirVisuel")}</p>
        <Button size="sm" variant="ghost" className="h-7" onClick={onFermer}>
          {t("common.close")}
        </Button>
      </div>
      {medias.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("slideshows.aucunVisuelLabel")}</p>
      ) : (
        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
          {medias.map((m) => (
            <button
              key={m.id}
              type="button"
              className="overflow-hidden rounded border hover:ring-2 hover:ring-primary"
              onClick={() => onChoisir(m.id)}
            >
              <img src={m.url} alt="" className="aspect-[3/4] w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function executerReimportPhotos(
  jobs: JobReimportPhoto[],
  opts: {
    onProgres: (fait: number, total: number) => void;
    onLog: (ligne: string) => void;
  },
): Promise<{ ok: number; echecs: number }> {
  let ok = 0;
  let echecs = 0;
  await executerEnLot(
    jobs,
    async (job) => {
      try {
        const r = await renettoyerSlideContenu(job.contenuId, job.position);
        if (r.ok && (r.nettoyee || r.remplacee)) {
          ok += 1;
        } else {
          echecs += 1;
          opts.onLog(
            `✗ ${job.contenuId.slice(0, 8)}#${job.position} — ${r.motif ?? r.erreur ?? "échec"}`,
          );
        }
      } catch (e) {
        echecs += 1;
        opts.onLog(
          `✗ ${job.contenuId.slice(0, 8)}#${job.position} — ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    },
    {
      largeur: AGENTS_REIMPORT_PHOTOS,
      onProgres: opts.onProgres,
    },
  );
  return { ok, echecs };
}

function VisuelsContenu({ contenu }: { contenu: SlideshowDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const structure = [...(contenu.structure_slides ?? [])].sort((a, b) => a.position - b.position);
  const [pickerPos, setPickerPos] = React.useState<number | null>(null);
  const [etapesParPos, setEtapesParPos] = React.useState<Record<number, EvenementEtape[]>>({});
  const [enCours, setEnCours] = React.useState<Set<number>>(() => new Set());
  const [erreurs, setErreurs] = React.useState<Record<number, string>>({});

  const { data: reglages } = useQuery({
    queryKey: ["reglages"],
    queryFn: lireReglages,
    staleTime: 30_000,
  });
  const premier: ProviderNettoyage = reglages?.nettoyage.provider_principal ?? "fal";

  const candidats = useQuery({
    queryKey: ["medias-contenu", contenu.id],
    queryFn: () => listerMediasPourContenu(contenu.id),
    enabled: pickerPos != null,
  });

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["slideshow", contenu.id] });
    void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
    void queryClient.invalidateQueries({ queryKey: ["medias"] });
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
  };

  async function lancerRenettoyer(position: number) {
    setEnCours((prev) => new Set(prev).add(position));
    setErreurs((prev) => {
      const n = { ...prev };
      delete n[position];
      return n;
    });
    setEtapesParPos((prev) => ({ ...prev, [position]: etapesInitiales(premier) }));
    try {
      await renettoyerSlideContenu(contenu.id, position, (ev) => {
        setEtapesParPos((prev) => ({
          ...prev,
          [position]: appliquerEvenement(
            prev[position] ?? etapesInitiales(premier),
            ev,
            premier,
          ),
        }));
      });
      setEtapesParPos((prev) => {
        const n = { ...prev };
        delete n[position];
        return n;
      });
      rafraichir();
    } catch (err) {
      setErreurs((prev) => ({
        ...prev,
        [position]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setEnCours((prev) => {
        const next = new Set(prev);
        next.delete(position);
        return next;
      });
    }
  }

  const remplacer = useMutation({
    mutationFn: (input: { position: number; mediaId: string }) =>
      majMediaSlideContenu(contenu.id, input.position, input.mediaId),
    onSuccess: () => {
      setPickerPos(null);
      rafraichir();
    },
  });

  if (structure.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("slideshows.visuelsEdit")}
      </h3>
      <p className="text-[11px] text-muted-foreground">{t("slideshows.visuelsEditAide")}</p>
      <div className="space-y-3">
        {structure.map((s) => {
          const img = urlPropre(contenu, s) ?? s.raw_url ?? s.reference_url;
          const etapes = etapesParPos[s.position];
          const slideEnCours = enCours.has(s.position);
          const erreur = erreurs[s.position];
          return (
            <div key={s.position} className="rounded border p-2">
              <div className="flex gap-2">
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="h-28 w-20 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                    #{s.position}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-xs font-medium">
                    {t("slideshows.slideN", { n: s.position })}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={slideEnCours || !(s.raw_url || s.reference_url)}
                      onClick={() => void lancerRenettoyer(s.position)}
                    >
                      <Sparkles className="size-3" />
                      {slideEnCours
                        ? t("slideshows.nettoyageEnCours")
                        : t("slideshows.renettoyer")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={remplacer.isPending}
                      onClick={() =>
                        setPickerPos(pickerPos === s.position ? null : s.position)
                      }
                    >
                      <ImageUp className="size-3" />
                      {t("slideshows.remplacer")}
                    </Button>
                    {s.media_id && (
                      <UpscaleMediaControl
                        mediaId={s.media_id}
                        compact
                        disabled={slideEnCours}
                        onSuccess={rafraichir}
                      />
                    )}
                  </div>
                  {etapes && (slideEnCours || erreur) ? (
                    <NettoyageEtapes
                      etapes={etapes}
                      className="rounded border bg-muted/30 p-1.5"
                    />
                  ) : null}
                  {erreur ? (
                    <p className="text-[11px] text-destructive">{erreur}</p>
                  ) : null}
                </div>
              </div>
              {pickerPos === s.position && (
                <div className="mt-2">
                  {candidats.isPending ? (
                    <p className="text-[11px] text-muted-foreground">{t("common.loading")}</p>
                  ) : (
                    <SelecteurMediaContenu
                      medias={candidats.data ?? []}
                      onChoisir={(mediaId) =>
                        remplacer.mutate({ position: s.position, mediaId })
                      }
                      onFermer={() => setPickerPos(null)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailSlideshow({
  id,
  onFermer,
}: {
  id: string;
  onFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["slideshow", id],
    queryFn: () => lireSlideshow(id),
  });

  const supprimer = useMutation({
    mutationFn: () => supprimerContenu(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
      void queryClient.removeQueries({ queryKey: ["slideshow", id] });
      onFermer();
    },
  });

  const d = detail.data as SlideshowDetail | null | undefined;
  const langues = d?.langues ?? [];
  const [langueSel, setLangueSel] = React.useState<string | null>(null);
  const [voirOriginal, setVoirOriginal] = React.useState(false);
  const [reimportDetail, setReimportDetail] = React.useState<{
    fait: number;
    total: number;
  } | null>(null);
  const [reimportDetailLogs, setReimportDetailLogs] = React.useState<string[]>([]);

  async function reimporterCeSlideshow() {
    if (!d || reimportDetail) return;
    const jobs = jobsReimportDepuisSlides(d.id, d.structure_slides);
    if (jobs.length === 0) {
      setReimportDetailLogs([t("slideshows.reimportVide")]);
      return;
    }
    if (
      !window.confirm(t("slideshows.reimportUnConfirm", { count: jobs.length }))
    ) {
      return;
    }
    setReimportDetail({ fait: 0, total: jobs.length });
    setReimportDetailLogs([
      t("slideshows.reimportDebut", {
        count: jobs.length,
        pool: AGENTS_REIMPORT_PHOTOS,
      }),
    ]);
    const { ok, echecs } = await executerReimportPhotos(jobs, {
      onProgres: (fait, total) => setReimportDetail({ fait, total }),
      onLog: (ligne) =>
        setReimportDetailLogs((prev) => [...prev.slice(-80), ligne]),
    });
    setReimportDetailLogs((prev) => [
      ...prev,
      t("slideshows.reimportFin", { ok, echecs }),
    ]);
    setReimportDetail(null);
    void queryClient.invalidateQueries({ queryKey: ["slideshow", id] });
    void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
    void queryClient.invalidateQueries({ queryKey: ["medias"] });
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
  }

  React.useEffect(() => {
    if (!d) return;
    const prefer =
      d.langues.find((l) => l.langue === d.langue_source)?.langue ??
      d.langues[0]?.langue ??
      null;
    setLangueSel(prefer);
  }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const langueActive = langues.find((l) => l.langue === langueSel) ?? langues[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50"
      onClick={onFermer}
    >
      <aside
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("slideshows.detail")}</h2>
          <Button size="icon" variant="ghost" aria-label={t("common.cancel")} onClick={onFermer}>
            <X className="size-4" />
          </Button>
        </div>

        {detail.isPending && (
          <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
        {detail.isError && (
          <p className="p-4 text-sm text-destructive">{(detail.error as Error).message}</p>
        )}
        {d && (
          <div className="space-y-5 p-4">
            <div>
              <p className="text-base font-medium">{d.titre || t("contenus.sansTitre")}</p>
              <p className="text-xs text-muted-foreground">
                {d.source?.handle_tiktok ? `@${d.source.handle_tiktok}` : "—"}
                {" · "}
                {t("slideshows.langueSource")}: {d.langue_source.toUpperCase()}
                {d.parent_id ? ` · ${t("contenus.variation")}` : ""}
              </p>
              {d.source_url && (
                <a
                  href={d.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-xs underline underline-offset-2"
                >
                  {t("slideshows.voirSource")}
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  d.statut === "valide"
                    ? "success"
                    : d.statut === "rejete"
                      ? "destructive"
                      : "secondary"
                }
              >
                {d.statut}
              </Badge>
              <Badge variant="outline">{d.import_statut}</Badge>
              {d.import_etape && <Badge variant="outline">{d.import_etape}</Badge>}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={
                  reimportDetail !== null ||
                  jobsReimportDepuisSlides(d.id, d.structure_slides).length === 0
                }
                onClick={() => void reimporterCeSlideshow()}
                title={t("slideshows.reimportUnAide")}
              >
                <RefreshCw
                  className={cn("size-3", reimportDetail && "animate-spin")}
                />
                {reimportDetail
                  ? t("slideshows.reimportLot", {
                      fait: reimportDetail.fait,
                      total: reimportDetail.total,
                    })
                  : t("slideshows.reimportUn")}
              </Button>
            </div>
            {reimportDetailLogs.length > 0 && (
              <div className="max-h-32 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {reimportDetailLogs.map((l, i) => (
                  <div key={`reimp-d-${i}-${l.slice(0, 16)}`} className="break-words">
                    {l}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded border p-2">
                <p className="text-muted-foreground">{t("slideshows.pertinence")}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {d.pertinence_score ?? "—"}
                </p>
              </div>
              <div className="rounded border p-2">
                <p className="text-muted-foreground">{t("slideshows.vuesSource")}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {d.vues_source?.toLocaleString(i18n.language) ?? "—"}
                </p>
              </div>
              <div className="rounded border p-2">
                <p className="text-muted-foreground">{t("slideshows.passages")}</p>
                <p className="text-lg font-semibold tabular-nums">{d.passages.length}</p>
              </div>
            </div>

            {d.pertinence_raison && (
              <p className="text-xs text-muted-foreground">{d.pertinence_raison}</p>
            )}
            {d.import_erreur && (
              <p className="text-xs text-destructive">{d.import_erreur}</p>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.elo")}
              </h3>
              {langues.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.eloVide")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {langues.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm"
                    >
                      <span>
                        {nomLangue(l.langue)}
                        {l.langue === d.langue_source ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({t("slideshows.origine")})
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{l.score.toFixed(1)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("slideshows.nbPassages", { count: l.nb_passages })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <VisuelsContenu contenu={d} />

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.decks")}
              </h3>
              {langues.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.decksVide")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {langues.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setLangueSel(l.langue)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium",
                          (langueActive?.langue ?? langueSel) === l.langue
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {l.langue.toUpperCase()}
                        <span className="ml-1 opacity-80">{l.score.toFixed(0)}</span>
                      </button>
                    ))}
                  </div>
                  {langueActive && (
                    <DeckLangue
                      contenu={d}
                      langue={langueActive}
                      estSource={langueActive.langue === d.langue_source}
                    />
                  )}
                </>
              )}
            </section>

            <section className="space-y-2">
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setVoirOriginal((v) => !v)}
              >
                {voirOriginal ? t("slideshows.masquerOriginal") : t("slideshows.voirOriginal")}
              </button>
              {voirOriginal && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[...(d.structure_slides ?? [])]
                    .sort((a, b) => a.position - b.position)
                    .map((s) => {
                      const url = s.raw_url ?? s.reference_url;
                      return url ? (
                        <img
                          key={s.position}
                          src={url}
                          alt=""
                          className="aspect-[3/4] w-full rounded border object-cover"
                        />
                      ) : (
                        <div
                          key={s.position}
                          className="flex aspect-[3/4] items-center justify-center rounded border text-[10px] text-muted-foreground"
                        >
                          #{s.position}
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.historique")}
              </h3>
              {d.passages.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.pasDePassage")}</p>
              ) : (
                <ul className="space-y-2">
                  {d.passages.map((p) => (
                    <li key={p.id} className="rounded border p-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-medium">
                          {p.comptes?.persona_nom ||
                            p.comptes?.handle_tiktok ||
                            p.compte_id.slice(0, 8)}
                        </span>
                        <Badge variant="outline">{p.statut}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {p.date_publication_prevue
                          ? new Date(p.date_publication_prevue).toLocaleDateString(
                              i18n.language,
                            )
                          : "—"}
                        {" · "}
                        {nomLangue(p.langue)}
                      </p>
                      <p className="tabular-nums text-muted-foreground">
                        {t("slideshows.statsLigne", {
                          vues: p.vues?.toLocaleString(i18n.language) ?? "—",
                          likes: p.likes?.toLocaleString(i18n.language) ?? "—",
                          coms: p.commentaires?.toLocaleString(i18n.language) ?? "—",
                        })}
                      </p>
                      <PassageLien
                        passageId={p.id}
                        postId={p.post_id}
                        publieUrl={p.publie_url}
                        statut={p.statut}
                        contenuId={d.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Labels
              </h3>
              <LabelEditor
                queryKey={["contenu-labels", d.id]}
                load={() => labelsDuContenu(d.id)}
                save={(ids) => setLabelsContenu(d.id, ids)}
              />
            </section>

            <section className="space-y-2 border-t pt-4">
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                disabled={supprimer.isPending}
                onClick={() => {
                  if (!window.confirm(t("slideshows.confirmDelete"))) return;
                  supprimer.mutate();
                }}
              >
                <Trash2 className="size-4" />
                {supprimer.isPending ? t("common.loading") : t("slideshows.supprimer")}
              </Button>
              {supprimer.isError && (
                <p className="text-xs text-destructive">
                  {(supprimer.error as Error).message}
                </p>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export function AdminSlideshowsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtre, setFiltre] = React.useState<"tous" | "valide" | "rejete">("tous");
  const [ouvert, setOuvert] = React.useState<string | null>(
    searchParams.get("id"),
  );
  const [reimport, setReimport] = React.useState<{
    fait: number;
    total: number;
  } | null>(null);
  const [reimportLogs, setReimportLogs] = React.useState<string[]>([]);

  React.useEffect(() => {
    const id = searchParams.get("id");
    if (id) setOuvert(id);
  }, [searchParams]);

  const contenus = useQuery({
    queryKey: ["slideshows", filtre],
    queryFn: () =>
      listerContenus({
        statut: filtre === "tous" ? undefined : filtre,
        limit: 200,
      }),
  });

  function fermerDetail() {
    setOuvert(null);
    if (searchParams.has("id")) {
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }

  /** Re-nettoie toutes les photos des slideshows valides (brut → propre qualité
   *  actuelle). Texte / OCR / decks / passages inchangés. */
  async function reimporterPhotosValides() {
    if (reimport) return;
    setReimportLogs([t("slideshows.reimportScan")]);
    let jobs;
    try {
      jobs = await listerJobsReimportPhotosValides();
    } catch (e) {
      setReimportLogs([
        `✗ ${e instanceof Error ? e.message : String(e)}`,
      ]);
      return;
    }
    if (jobs.length === 0) {
      setReimportLogs([t("slideshows.reimportVide")]);
      return;
    }
    if (
      !window.confirm(
        t("slideshows.reimportConfirm", { count: jobs.length }),
      )
    ) {
      setReimportLogs([]);
      return;
    }

    setReimport({ fait: 0, total: jobs.length });
    setReimportLogs([
      t("slideshows.reimportDebut", {
        count: jobs.length,
        pool: AGENTS_REIMPORT_PHOTOS,
      }),
    ]);
    const { ok, echecs } = await executerReimportPhotos(jobs, {
      onProgres: (fait, total) => setReimport({ fait, total }),
      onLog: (ligne) =>
        setReimportLogs((prev) => [...prev.slice(-80), ligne]),
    });
    setReimportLogs((prev) => [
      ...prev,
      t("slideshows.reimportFin", { ok, echecs }),
    ]);
    setReimport(null);
    void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
    void queryClient.invalidateQueries({ queryKey: ["slideshow"] });
    void queryClient.invalidateQueries({ queryKey: ["medias"] });
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{t("slideshows.title")}</CardTitle>
              <CardDescription>{t("slideshows.subtitle")}</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={reimport !== null}
              onClick={() => void reimporterPhotosValides()}
              title={t("slideshows.reimportAide")}
            >
              <RefreshCw className={cn("size-4", reimport && "animate-spin")} />
              {reimport
                ? t("slideshows.reimportLot", {
                    fait: reimport.fait,
                    total: reimport.total,
                  })
                : t("slideshows.reimportPhotos")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {reimportLogs.length > 0 && (
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed">
              {reimportLogs.map((l, i) => (
                <div
                  key={`reimp-${i}-${l.slice(0, 16)}`}
                  className="break-words text-muted-foreground"
                >
                  {l}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(["tous", "valide", "rejete"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltre(f)}
                className={
                  filtre === f
                    ? "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    : "rounded-md border px-3 py-1 text-xs"
                }
              >
                {t(`contenus.filtre.${f}`)}
              </button>
            ))}
          </div>

          {contenus.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {!contenus.isPending && (contenus.data?.length ?? 0) === 0 && (
            <EmptyState title={t("slideshows.empty")} />
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(contenus.data ?? []).map((c) => {
              const img = vignette(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setOuvert(c.id);
                    setSearchParams({ id: c.id }, { replace: true });
                  }}
                  className={cn(
                    "overflow-hidden rounded-lg border text-left transition hover:ring-2 hover:ring-primary",
                    c.statut === "rejete" && "opacity-70",
                  )}
                >
                  {img ? (
                    <img src={img} alt="" className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-muted text-xs text-muted-foreground">
                      {t("slideshows.sansImage")}
                    </div>
                  )}
                  <div className="space-y-1 p-2">
                    <p className="line-clamp-2 text-xs font-medium">
                      {c.titre || t("contenus.sansTitre")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(c.scores ?? [])
                        .slice()
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 4)
                        .map((s) => (
                          <span
                            key={s.langue}
                            className="rounded border px-1 py-0.5 text-[10px] tabular-nums"
                          >
                            {s.langue.toUpperCase()} {s.score.toFixed(0)}
                          </span>
                        ))}
                    </div>
                    <Badge
                      variant={
                        c.statut === "valide"
                          ? "success"
                          : c.statut === "rejete"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {c.statut}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {ouvert && <DetailSlideshow id={ouvert} onFermer={fermerDetail} />}
    </div>
  );
}
