import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ImageUp, PenLine, RefreshCw, ScanText, Sparkles, Trash2, X } from "lucide-react";

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
  captionnerMediaBiblio,
  collecterMediaIdsContenus,
  idsContenusParLabel,
  labelsDuContenu,
  lireReglages,
  lireSlideshow,
  listerContenus,
  listerLabels,
  listerSources,
  statsSlideshowsParSource,
  jobsReimportDepuisSlides,
  listerJobsReimportPhotosValides,
  listerMediasPourContenu,
  majMediaSlideContenu,
  marquerUgcParLabel,
  mediaIdsDepuisSlides,
  renettoyerSlideContenu,
  renseignerLienPublie,
  majTierContenu,
  scannerVisageUgcMedia,
  setContenuUgcCompatible,
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
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomLangue } from "@/features/moteur/langues";
import type { ContenuLangue, ContenuSlide, Media, Tier } from "@/features/moteur/types";
import { PASSAGES_PAR_TIER, TIERS } from "@/features/moteur/types";
import { ugcVisages } from "@/features/moteur/ugcVisages";
import {
  AGENTS_REIMPORT_PHOTOS,
  AGENTS_VISION_UGC,
  executerEnLot,
} from "@/lib/lot";
import { cn } from "@/lib/utils";

/** Couleur par rang — un S+ doit sauter aux yeux dans la grille. */
const CLASSE_TIER: Record<Tier, string> = {
  D: "border-muted-foreground/30 bg-muted text-muted-foreground",
  C: "border-slate-300 bg-slate-100 text-slate-700",
  B: "border-sky-300 bg-sky-100 text-sky-800",
  A: "border-emerald-300 bg-emerald-100 text-emerald-800",
  S: "border-amber-300 bg-amber-100 text-amber-900",
  "S+": "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900",
};

function BadgeTier({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
        CLASSE_TIER[tier] ?? CLASSE_TIER.D,
        className,
      )}
    >
      {tier}
    </span>
  );
}

function slideshowDepuisListe(c: ContenuListe): SlideshowDetail {
  return ugcVisages.appliquerOptimistic({
    ...c,
    langues: [],
    passages: [],
  });
}

function detailDepuisListe(qc: QueryClient, id: string): SlideshowDetail | undefined {
  const entrees = qc.getQueriesData<ContenuListe[]>({ queryKey: ["slideshows"] });
  for (const [, liste] of entrees) {
    const found = liste?.find((c) => c.id === id);
    if (found) return slideshowDepuisListe(found);
  }
}

function seedSlideshowDetail(qc: QueryClient, id: string) {
  if (qc.getQueryData(["slideshow", id])) return;
  const seed = detailDepuisListe(qc, id);
  if (seed) qc.setQueryData<SlideshowDetail>(["slideshow", id], seed);
}

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

type TriSlideshow = "recent" | "tier" | "posts" | "compte";
/** null = tous ; "__none__" = sans label ; sinon id label */
type FiltreLabel = string | null;
/** null = tous ; "__none__" = source oubliée ; sinon id compte_reference */
type FiltreCompte = string | null;
type FiltreUgc = "tous" | "oui" | "non";

/** Rang d'un contenu en valeur triable (D = 0 … S+ = 5). */
function rangTier(c: ContenuListe): number {
  const idx = TIERS.indexOf(c.tier);
  return idx < 0 ? -1 : idx;
}

function filtreSlideshows(
  liste: ContenuListe[],
  opts: { labelId: FiltreLabel; ugc: FiltreUgc },
): ContenuListe[] {
  return liste.filter((c) => {
    if (opts.ugc === "oui" && !c.ugc_compatible) return false;
    if (opts.ugc === "non" && c.ugc_compatible) return false;
    if (opts.labelId === "__none__") {
      return (c.labels ?? []).length === 0;
    }
    if (opts.labelId) {
      return (c.labels ?? []).some((l) => l.id === opts.labelId);
    }
    return true;
  });
}

function handleDuContenu(
  c: ContenuListe,
  handleParId: Map<string, string>,
): string {
  if (!c.compte_reference_id) return "";
  return handleParId.get(c.compte_reference_id) ?? "";
}

function trierSlideshows(
  liste: ContenuListe[],
  tri: TriSlideshow,
  handleParId: Map<string, string>,
): ContenuListe[] {
  const arr = [...liste];
  const parDate = (a: ContenuListe, b: ContenuListe) =>
    b.created_at.localeCompare(a.created_at);
  switch (tri) {
    case "tier":
      return arr.sort((a, b) => {
        const diff = rangTier(b) - rangTier(a);
        if (diff !== 0) return diff;
        // À rang égal, celui qui a le plus de passages à faire d'abord.
        const restants =
          (b.tierEtat?.restants ?? 0) - (a.tierEtat?.restants ?? 0);
        return restants !== 0 ? restants : parDate(a, b);
      });
    case "posts":
      return arr.sort((a, b) => {
        const diff = (b.nb_posts ?? 0) - (a.nb_posts ?? 0);
        return diff !== 0 ? diff : parDate(a, b);
      });
    case "compte":
      return arr.sort((a, b) => {
        const ha = handleDuContenu(a, handleParId);
        const hb = handleDuContenu(b, handleParId);
        const cmp = ha.localeCompare(hb, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        if (!a.compte_reference_id && b.compte_reference_id) return 1;
        if (a.compte_reference_id && !b.compte_reference_id) return -1;
        return parDate(a, b);
      });
    default:
      return arr.sort(parDate);
  }
}

function Chip({
  actif,
  onClick,
  children,
  style,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={
        actif
          ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          : "rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
      }
    >
      {children}
    </button>
  );
}

const DeckLangue = React.memo(function DeckLangue({
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
  const aPassage = (contenu.passages ?? []).some((p) => p.langue === langue.langue);
  const aTexteLangue = (langue.slides ?? []).some((s) => s.texte_overlay?.trim());
  const sourceCl = (contenu.langues ?? []).find((l) => l.langue === contenu.langue_source);
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
                <img
                  src={img}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/4] w-full object-cover"
                />
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
                {s.pinned ? (
                  <p className="text-[10px] text-muted-foreground">{t("creation.pinned")}</p>
                ) : s.critere ? (
                  <p className="text-[10px] text-muted-foreground">
                    {t("creation.critere")} : {s.critere}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

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

async function executerScanVisagesUgc(
  mediaIds: string[],
  opts: {
    onProgres: (fait: number, total: number) => void;
    onLog: (ligne: string) => void;
  },
): Promise<{ ok: number; echecs: number }> {
  let ok = 0;
  let echecs = 0;
  await executerEnLot(
    mediaIds,
    async (mediaId) => {
      try {
        const r = await scannerVisageUgcMedia(mediaId);
        ok += 1;
        opts.onLog(
          `✓ ${mediaId.slice(0, 8)} → ${r.visage_premier_plan ? "visage" : "non"}`,
        );
      } catch (e) {
        echecs += 1;
        opts.onLog(
          `✗ ${mediaId.slice(0, 8)} — ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    },
    {
      largeur: AGENTS_VISION_UGC,
      onProgres: opts.onProgres,
    },
  );
  return { ok, echecs };
}

const VisuelsContenu = React.memo(function VisuelsContenu({
  contenu,
}: {
  contenu: SlideshowDetail;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const structure = [...(contenu.structure_slides ?? [])].sort((a, b) => a.position - b.position);
  const [pickerPos, setPickerPos] = React.useState<number | null>(null);
  const [etapesParPos, setEtapesParPos] = React.useState<Record<number, EvenementEtape[]>>({});
  const [enCours, setEnCours] = React.useState<Set<number>>(() => new Set());
  const [erreurs, setErreurs] = React.useState<Record<number, string>>({});
  const [erreursVisage, setErreursVisage] = React.useState<Record<string, string>>({});
  const [captionBusy, setCaptionBusy] = React.useState<Set<string>>(() => new Set());
  const [erreursCaption, setErreursCaption] = React.useState<Record<string, string>>({});
  const [visagesLocaux, setVisagesLocaux] = React.useState<Record<string, boolean | null>>(
    () => ugcVisages.overlayVisages(contenu.mediaVisages),
  );

  React.useEffect(() => {
    setVisagesLocaux(ugcVisages.overlayVisages(contenu.mediaVisages));
  }, [contenu.id, contenu.mediaVisages]);

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

  async function captionnerSlide(mediaId: string, forcer: boolean) {
    setCaptionBusy((prev) => new Set(prev).add(mediaId));
    setErreursCaption((prev) => {
      if (!(mediaId in prev)) return prev;
      const n = { ...prev };
      delete n[mediaId];
      return n;
    });
    try {
      await captionnerMediaBiblio(mediaId, { forcer });
      rafraichir();
    } catch (err) {
      setErreursCaption((prev) => ({
        ...prev,
        [mediaId]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setCaptionBusy((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
    }
  }

  function cliquerVisage(mediaId: string, valeur: boolean | null) {
    setVisagesLocaux((prev) => ({ ...prev, [mediaId]: valeur }));
    setErreursVisage((prev) => {
      if (!(mediaId in prev)) return prev;
      const n = { ...prev };
      delete n[mediaId];
      return n;
    });
    void ugcVisages.persisterVisage(mediaId, valeur).catch((err) => {
      setErreursVisage((prev) => ({
        ...prev,
        [mediaId]: err instanceof Error ? err.message : String(err),
      }));
    });
  }

  if (structure.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("slideshows.visuelsEdit")}
      </h3>
      <p className="text-[11px] text-muted-foreground">{t("slideshows.visuelsEditAide")}</p>
      {contenu.ugc_compatible && (
        <p className="text-[11px] text-muted-foreground">{t("slideshows.ugcVisageAide")}</p>
      )}
      <div className="space-y-3">
        {structure.map((s) => {
          const img = urlPropre(contenu, s) ?? s.raw_url ?? s.reference_url;
          const etapes = etapesParPos[s.position];
          const slideEnCours = enCours.has(s.position);
          const erreur = erreurs[s.position];
          const visage =
            s.media_id != null
              ? (visagesLocaux[s.media_id] ?? contenu.mediaVisages?.[s.media_id] ?? null)
              : null;
          const metaCap = s.media_id ? contenu.mediaCaptions?.[s.media_id] : undefined;
          return (
            <div key={s.position} className="rounded border p-2">
              <div className="flex gap-2">
                {img ? (
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    decoding="async"
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
                    {metaCap?.est_hook || s.position === 1 ? (
                      <Badge variant="secondary" className="ml-1.5 align-middle">
                        {t("slideshows.captionHook")}
                      </Badge>
                    ) : null}
                  </p>
                  {metaCap?.caption ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {metaCap.caption}
                    </p>
                  ) : metaCap?.caption_statut === "aucune" ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("slideshows.captionAucune")}
                    </p>
                  ) : null}
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
                    {s.media_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={captionBusy.has(s.media_id)}
                        onClick={() =>
                          void captionnerSlide(s.media_id!, Boolean(metaCap?.caption_statut))
                        }
                      >
                        <ScanText className="size-3" />
                        {captionBusy.has(s.media_id)
                          ? t("slideshows.captionEnCours")
                          : t("slideshows.captionUne")}
                      </Button>
                    )}
                  </div>
                  {contenu.ugc_compatible && s.media_id && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t("slideshows.ugcVisage")}
                      </span>
                      {(
                        [
                          [true, t("slideshows.ugcVisageOui")],
                          [false, t("slideshows.ugcVisageNon")],
                          [null, t("slideshows.ugcVisageInconnu")],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => cliquerVisage(s.media_id!, val)}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            visage === val
                              ? val === true
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : val === false
                                  ? "border-slate-700 bg-slate-700 text-white"
                                  : "border-primary bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {s.media_id && erreursVisage[s.media_id] ? (
                    <p className="text-[11px] text-destructive">
                      {erreursVisage[s.media_id]}
                    </p>
                  ) : null}
                  {s.media_id && erreursCaption[s.media_id] ? (
                    <p className="text-[11px] text-destructive">
                      {erreursCaption[s.media_id]}
                    </p>
                  ) : null}
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
});

function DetailSlideshow({
  id,
  onFermer,
}: {
  id: string;
  onFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { applicationId } = useApplication();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["slideshow", id],
    queryFn: async () => {
      const fresh = await lireSlideshow(id);
      return fresh ? ugcVisages.appliquerOptimistic(fresh) : fresh;
    },
    initialData: () =>
      queryClient.getQueryData<SlideshowDetail>(["slideshow", id]) ??
      detailDepuisListe(queryClient, id),
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
  const [ugcScan, setUgcScan] = React.useState<{
    fait: number;
    total: number;
  } | null>(null);
  const [ugcBusy, setUgcBusy] = React.useState(false);
  const [ugcLogs, setUgcLogs] = React.useState<string[]>([]);
  const [labelUgcId, setLabelUgcId] = React.useState("");

  const labelsTous = useQuery({
    queryKey: ["labels", applicationId],
    queryFn: () => listerLabels(applicationId),
    staleTime: 60_000,
    enabled: Boolean(applicationId),
  });

  /** Patch cache détail + listes — pas de refetch lourd. */
  function patchUgcCache(opts: {
    ugc: boolean;
    mediaVisages?: Record<string, boolean | null>;
  }) {
    queryClient.setQueryData<SlideshowDetail>(["slideshow", id], (prev) => {
      if (!prev) return prev;
      const visages = opts.mediaVisages
        ? { ...(prev.mediaVisages ?? {}), ...opts.mediaVisages }
        : prev.mediaVisages;
      return {
        ...prev,
        ugc_compatible: opts.ugc,
        mediaVisages: ugcVisages.overlayVisages(visages),
      };
    });
    queryClient.setQueriesData<ContenuListe[]>(
      { queryKey: ["slideshows"] },
      (prev) => {
        if (!prev) return prev;
        return prev.map((c) =>
          c.id === id ? { ...c, ugc_compatible: opts.ugc } : c,
        );
      },
    );
  }

  async function scannerMediasUgc(mediaIds: string[]) {
    if (mediaIds.length === 0) {
      setUgcLogs([t("slideshows.ugcAucunMedia")]);
      return;
    }
    ugcVisages.oublierOverrides(mediaIds);
    setUgcScan({ fait: 0, total: mediaIds.length });
    setUgcLogs([
      t("slideshows.ugcScanDebut", {
        count: mediaIds.length,
        pool: AGENTS_VISION_UGC,
      }),
    ]);
    const { ok, echecs } = await executerScanVisagesUgc(mediaIds, {
      onProgres: (fait, total) => setUgcScan({ fait, total }),
      onLog: (ligne) => setUgcLogs((prev) => [...prev.slice(-80), ligne]),
    });
    setUgcLogs((prev) => [
      ...prev,
      t("slideshows.ugcScanFin", { ok, echecs }),
    ]);
    setUgcScan(null);
    // Refresh pour récupérer les YES/NO scannés (uniquement après scan IA).
    void queryClient.invalidateQueries({ queryKey: ["slideshow", id] });
    void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
  }

  async function activerUgcCeSlideshow(avecScan: boolean) {
    if (!d || ugcScan || ugcBusy) return;
    const mediaIds = mediaIdsDepuisSlides(d.structure_slides);
    const mediaVisages: Record<string, boolean | null> = {};
    for (const mid of mediaIds) mediaVisages[mid] = false;

    const snapshot = {
      ugc: d.ugc_compatible,
      mediaVisages: { ...(d.mediaVisages ?? {}) },
    };

    setUgcBusy(true);
    ugcVisages.poserUgcOptimistic(d.id, true);
    ugcVisages.poserVisagesDefautNon(mediaIds);
    const job = setContenuUgcCompatible(d.id, true, { mediaIds });
    ugcVisages.poserBarriereInit(job);
    // UI immédiate — l'utilisateur peut déjà cliquer Oui/Non sur les slides.
    patchUgcCache({
      ugc: true,
      mediaVisages: ugcVisages.overlayVisages(mediaVisages),
    });
    setUgcLogs([
      avecScan
        ? t("slideshows.ugcMarquePuisScan")
        : t("slideshows.ugcMarqueManuel"),
    ]);
    try {
      await job;
    } catch (e) {
      ugcVisages.poserUgcOptimistic(d.id, snapshot.ugc);
      ugcVisages.oublierOverrides(mediaIds);
      patchUgcCache({
        ugc: snapshot.ugc,
        mediaVisages: snapshot.mediaVisages,
      });
      setUgcLogs([
        `✗ ${e instanceof Error ? e.message : String(e)}`,
      ]);
      setUgcBusy(false);
      return;
    }
    setUgcBusy(false);
    if (avecScan) {
      await scannerMediasUgc(mediaIds);
    }
  }

  async function desactiverUgcCeSlideshow() {
    if (!d || ugcScan || ugcBusy) return;
    const snapshot = d.ugc_compatible;
    setUgcBusy(true);
    ugcVisages.poserUgcOptimistic(d.id, false);
    patchUgcCache({ ugc: false });
    try {
      await setContenuUgcCompatible(d.id, false);
    } catch (e) {
      ugcVisages.poserUgcOptimistic(d.id, snapshot);
      patchUgcCache({ ugc: snapshot });
      setUgcLogs([
        `✗ ${e instanceof Error ? e.message : String(e)}`,
      ]);
    } finally {
      setUgcBusy(false);
    }
  }

  async function lancerUgcLabel(labelId: string, avecScan: boolean) {
    if (!labelId || ugcScan || ugcBusy) return;
    const nom =
      labelsTous.data?.find((l) => l.id === labelId)?.nom ??
      d?.labels?.find((l) => l.id === labelId)?.nom ??
      labelId.slice(0, 8);
    const existants = await idsContenusParLabel(labelId);
    if (
      !window.confirm(
        t(
          avecScan
            ? "slideshows.ugcLabelConfirmScan"
            : "slideshows.ugcLabelConfirm",
          { count: existants.length, nom },
        ),
      )
    ) {
      return;
    }
    setUgcBusy(true);
    setUgcLogs([t("slideshows.ugcBulkMarque", { count: existants.length })]);
    try {
      const ids = await marquerUgcParLabel(labelId, true);
      if (ids.includes(id)) {
        const mediaIds = mediaIdsDepuisSlides(d?.structure_slides);
        ugcVisages.poserUgcOptimistic(id, true);
        ugcVisages.poserVisagesDefautNon(mediaIds);
        const mediaVisages: Record<string, boolean | null> = {};
        for (const mid of mediaIds) mediaVisages[mid] = false;
        patchUgcCache({
          ugc: true,
          mediaVisages: ugcVisages.overlayVisages(mediaVisages),
        });
      }
      queryClient.setQueriesData<ContenuListe[]>(
        { queryKey: ["slideshows"] },
        (prev) => {
          if (!prev) return prev;
          const set = new Set(ids);
          return prev.map((c) =>
            set.has(c.id) ? { ...c, ugc_compatible: true } : c,
          );
        },
      );
      setUgcLogs([t("slideshows.ugcBulkMarque", { count: ids.length })]);
      if (avecScan) {
        const mediaIds = await collecterMediaIdsContenus(ids);
        setUgcBusy(false);
        await scannerMediasUgc(mediaIds);
        return;
      }
    } catch (e) {
      setUgcLogs([
        `✗ ${e instanceof Error ? e.message : String(e)}`,
      ]);
      void queryClient.invalidateQueries({ queryKey: ["slideshow", id] });
      void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
    } finally {
      setUgcBusy(false);
    }
  }

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

  const changerTier = useMutation({
    mutationFn: (tier: Tier) => majTierContenu(id, tier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slideshow", id] });
      void queryClient.invalidateQueries({ queryKey: ["slideshows"] });
    },
  });

  React.useEffect(() => {
    if (!d) return;
    const langs = d.langues ?? [];
    if (langs.length === 0) return;
    setLangueSel((cur) => {
      if (cur && langs.some((l) => l.langue === cur)) return cur;
      return (
        langs.find((l) => l.langue === d.langue_source)?.langue ??
        langs[0]?.langue ??
        null
      );
    });
  }, [d, langues.length]);

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

        {detail.isPending && !d && (
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
              {d.creation_mode === "manuel" && (
                <Badge variant="outline">{t("slideshows.manuelBadge")}</Badge>
              )}
              {d.ugc_compatible && (
                <Badge variant="success" className="gap-1">
                  <Check className="size-3" />
                  {t("slideshows.ugcBadge")}
                </Badge>
              )}
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

            <section className="space-y-2 rounded border p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.ugcSection")}
              </h3>
              <p className="text-[11px] text-muted-foreground">{t("slideshows.ugcAide")}</p>
              <div className="flex flex-wrap gap-1.5">
                {!d.ugc_compatible ? (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={ugcScan !== null || ugcBusy}
                      onClick={() => void activerUgcCeSlideshow(false)}
                    >
                      <Check className="size-3" />
                      {t("slideshows.ugcActiver")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={ugcScan !== null || ugcBusy}
                      onClick={() => void activerUgcCeSlideshow(true)}
                    >
                      <RefreshCw
                        className={cn(
                          "size-3",
                          (ugcScan || ugcBusy) && "animate-spin",
                        )}
                      />
                      {ugcScan
                        ? t("slideshows.ugcScanLot", {
                            fait: ugcScan.fait,
                            total: ugcScan.total,
                          })
                        : t("slideshows.ugcActiverEtScanner")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={ugcScan !== null || ugcBusy}
                      onClick={() => void desactiverUgcCeSlideshow()}
                    >
                      {t("slideshows.ugcDesactiver")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={ugcScan !== null || ugcBusy}
                      onClick={() =>
                        void scannerMediasUgc(
                          mediaIdsDepuisSlides(d.structure_slides),
                        )
                      }
                    >
                      <RefreshCw
                        className={cn("size-3", ugcScan && "animate-spin")}
                      />
                      {ugcScan
                        ? t("slideshows.ugcScanLot", {
                            fait: ugcScan.fait,
                            total: ugcScan.total,
                          })
                        : t("slideshows.ugcRescan")}
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  className="h-7 min-w-[10rem] flex-1 rounded-md border bg-background px-2 text-xs"
                  value={labelUgcId}
                  onChange={(e) => setLabelUgcId(e.target.value)}
                  disabled={ugcScan !== null || ugcBusy}
                >
                  <option value="">{t("slideshows.ugcChoisirLabel")}</option>
                  {(d.labels ?? []).map((l) => (
                    <option key={`d-${l.id}`} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                  {(labelsTous.data ?? [])
                    .filter((l) => !(d.labels ?? []).some((x) => x.id === l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nom}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!labelUgcId || ugcScan !== null || ugcBusy}
                  onClick={() => void lancerUgcLabel(labelUgcId, false)}
                >
                  {t("slideshows.ugcLabel")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={!labelUgcId || ugcScan !== null || ugcBusy}
                  onClick={() => void lancerUgcLabel(labelUgcId, true)}
                  title={t("slideshows.ugcLabelScanAide")}
                >
                  {t("slideshows.ugcLabelScan")}
                </Button>
              </div>
              {ugcLogs.length > 0 && (
                <div className="max-h-32 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {ugcLogs.map((l, i) => (
                    <div key={`ugc-${i}-${l.slice(0, 16)}`} className="break-words">
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <VisuelsContenu contenu={d} />
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
                <p className="text-lg font-semibold tabular-nums">
                  {(d.passages ?? []).length}
                </p>
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
                {t("slideshows.tierlist")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    disabled={changerTier.isPending}
                    onClick={() => changerTier.mutate(tier)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-bold disabled:opacity-50",
                      d.tier === tier
                        ? CLASSE_TIER[tier]
                        : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                    title={t("slideshows.tierPassages", {
                      count: PASSAGES_PAR_TIER[tier],
                    })}
                  >
                    {tier}
                  </button>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t("slideshows.passages")}</dt>
                <dd className="tabular-nums">
                  {t("slideshows.passagesDetail", {
                    publies: d.tierEtat?.publies ?? 0,
                    prevus: d.tierEtat?.passages_prevus ?? d.passages_prevus,
                    envol: d.tierEtat?.en_vol ?? 0,
                  })}
                </dd>
                <dt className="text-muted-foreground">{t("slideshows.moyenneVues")}</dt>
                <dd className="tabular-nums">
                  {d.tierEtat?.moyenne_vues != null
                    ? Math.round(d.tierEtat.moyenne_vues).toLocaleString()
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">{t("slideshows.meilleurPassage")}</dt>
                <dd className="tabular-nums">
                  {d.tierEtat?.max_vues != null
                    ? d.tierEtat.max_vues.toLocaleString()
                    : "—"}
                </dd>
              </dl>
              {d.tier_rapport?.regle ? (
                <p className="text-xs text-muted-foreground">
                  {t("slideshows.derniereRequalif", {
                    avant: d.tier_rapport.avant ?? "—",
                    apres: d.tier_rapport.apres ?? d.tier,
                    regle: d.tier_rapport.regle,
                  })}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("slideshows.tierlistAide")}</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.noteImport")}
              </h3>
              {langues.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {detail.isFetching
                    ? t("common.loading")
                    : t("slideshows.eloVide")}
                </p>
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

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.decks")}
              </h3>
              {langues.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {detail.isFetching
                    ? t("common.loading")
                    : t("slideshows.decksVide")}
                </p>
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
                          loading="lazy"
                          decoding="async"
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
              {(d.passages ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {detail.isFetching
                    ? t("common.loading")
                    : t("slideshows.pasDePassage")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {(d.passages ?? []).map((p) => (
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
  const { applicationId } = useApplication();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtre, setFiltre] = React.useState<"tous" | "valide" | "rejete">("tous");
  const [filtreLabel, setFiltreLabel] = React.useState<FiltreLabel>(null);
  const [filtreCompte, setFiltreCompte] = React.useState<FiltreCompte>(null);
  const [filtreUgc, setFiltreUgc] = React.useState<FiltreUgc>("tous");
  const [tri, setTri] = React.useState<TriSlideshow>("recent");
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
    queryKey: ["slideshows", applicationId, filtre, filtreLabel, filtreCompte],
    queryFn: () =>
      listerContenus({
        statut: filtre === "tous" ? undefined : filtre,
        limit: filtreCompte ? 500 : 200,
        labelId:
          filtreLabel && filtreLabel !== "__none__" ? filtreLabel : undefined,
        sansLabel: filtreLabel === "__none__",
        compteReferenceId:
          filtreCompte && filtreCompte !== "__none__" ? filtreCompte : undefined,
        sansCompte: filtreCompte === "__none__",
        applicationId,
      }),
    enabled: Boolean(applicationId),
  });

  const sources = useQuery({
    queryKey: ["sources", applicationId],
    queryFn: () => listerSources(applicationId),
    staleTime: 60_000,
    enabled: Boolean(applicationId),
  });

  const statsComptes = useQuery({
    queryKey: ["slideshows", "stats-comptes"],
    queryFn: statsSlideshowsParSource,
    staleTime: 30_000,
  });

  const labelsTous = useQuery({
    queryKey: ["labels", applicationId],
    queryFn: () => listerLabels(applicationId),
    staleTime: 60_000,
    enabled: Boolean(applicationId),
  });

  const labelsDisponibles = React.useMemo(() => {
    const fromListe = labelsTous.data ?? [];
    if (fromListe.length > 0) {
      return [...fromListe].sort((a, b) =>
        a.nom.localeCompare(b.nom, undefined, { sensitivity: "base" }),
      );
    }
    // Fallback : labels présents sur les contenus chargés
    const map = new Map<string, { id: string; nom: string; couleur: string | null }>();
    for (const c of contenus.data ?? []) {
      for (const l of c.labels ?? []) {
        if (!map.has(l.id)) map.set(l.id, l);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.nom.localeCompare(b.nom, undefined, { sensitivity: "base" }),
    );
  }, [labelsTous.data, contenus.data]);

  const handleParId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources.data ?? []) {
      m.set(s.id, s.handle_tiktok.replace(/^@+/, ""));
    }
    return m;
  }, [sources.data]);

  const contenusTries = React.useMemo(() => {
    // Label / compte déjà filtrés côté serveur ; UGC reste client.
    const filtres = filtreSlideshows(contenus.data ?? [], {
      labelId: null,
      ugc: filtreUgc,
    });
    return trierSlideshows(filtres, tri, handleParId);
  }, [contenus.data, filtreUgc, tri, handleParId]);

  const statsActives = statsComptes.data ?? [];
  const statsFiltre = statsActives.find((s) =>
    filtreCompte === "__none__"
      ? s.compteReferenceId === null
      : s.compteReferenceId === filtreCompte,
  );

  const groupesCompte = React.useMemo(() => {
    if (tri !== "compte" || filtreCompte) return null;
    const groupes: Array<{
      key: string;
      handle: string;
      items: ContenuListe[];
    }> = [];
    const index = new Map<string, number>();
    for (const c of contenusTries) {
      const key = c.compte_reference_id ?? "__none__";
      const i = index.get(key);
      if (i === undefined) {
        index.set(key, groupes.length);
        groupes.push({
          key,
          handle: handleDuContenu(c, handleParId),
          items: [c],
        });
      } else {
        groupes[i].items.push(c);
      }
    }
    return groupes;
  }, [tri, filtreCompte, contenusTries, handleParId]);

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
            <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/admin/creation">
                <PenLine className="size-4" />
                {t("labels.creerPost")}
              </Link>
            </Button>
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
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["tous", "valide", "rejete"] as const).map((f) => (
                <Chip key={f} actif={filtre === f} onClick={() => setFiltre(f)}>
                  {t(`contenus.filtre.${f}`)}
                </Chip>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("slideshows.filtreCompte")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  actif={filtreCompte === null}
                  onClick={() => setFiltreCompte(null)}
                >
                  {t("slideshows.filtreComptesTous")}
                </Chip>
                {statsActives.map((s) => {
                  const cle = s.compteReferenceId ?? "__none__";
                  const label = s.compteReferenceId
                    ? `@${s.handle}`
                    : t("slideshows.sansCompte");
                  return (
                    <Chip
                      key={cle}
                      actif={filtreCompte === cle}
                      onClick={() =>
                        setFiltreCompte(filtreCompte === cle ? null : cle)
                      }
                    >
                      <span className="flex flex-col items-start gap-0.5 text-left leading-tight">
                        <span>{label}</span>
                        <span className="font-normal opacity-80">
                          {t("slideshows.compteChip", {
                            gardes: s.gardes,
                            importes: s.importes,
                          })}
                          {s.rejetes > 0 || s.encours > 0
                            ? ` · ${t("slideshows.compteChipSuite", {
                                rejetes: s.rejetes,
                                encours: s.encours,
                              })}`
                            : ""}
                        </span>
                      </span>
                    </Chip>
                  );
                })}
              </div>
              {statsFiltre && (
                <p className="text-[11px] text-muted-foreground">
                  {statsFiltre.compteReferenceId
                    ? t("slideshows.compteResume", {
                        handle: statsFiltre.handle,
                        importes: statsFiltre.importes,
                        gardes: statsFiltre.gardes,
                        rejetes: statsFiltre.rejetes,
                        encours: statsFiltre.encours,
                      })
                    : `${t("slideshows.sansCompte")} — ${t("slideshows.compteStats", {
                        importes: statsFiltre.importes,
                        gardes: statsFiltre.gardes,
                        rejetes: statsFiltre.rejetes,
                        encours: statsFiltre.encours,
                      })}`}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("slideshows.filtreLabel")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  actif={filtreLabel === null}
                  onClick={() => setFiltreLabel(null)}
                >
                  {t("slideshows.filtreLabelsTous")}
                </Chip>
                <Chip
                  actif={filtreLabel === "__none__"}
                  onClick={() => setFiltreLabel("__none__")}
                >
                  {t("slideshows.sansLabel")}
                </Chip>
                {labelsDisponibles.map((l) => (
                  <Chip
                    key={l.id}
                    actif={filtreLabel === l.id}
                    onClick={() =>
                      setFiltreLabel(filtreLabel === l.id ? null : l.id)
                    }
                    style={
                      filtreLabel === l.id || !l.couleur
                        ? undefined
                        : { borderColor: l.couleur, color: l.couleur }
                    }
                  >
                    {l.nom}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("slideshows.filtreUgc")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["tous", "filtreUgcTous"],
                      ["oui", "filtreUgcOui"],
                      ["non", "filtreUgcNon"],
                    ] as const
                  ).map(([k, cle]) => (
                    <Chip
                      key={k}
                      actif={filtreUgc === k}
                      onClick={() => setFiltreUgc(k)}
                    >
                      {t(`slideshows.${cle}`)}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("slideshows.triLabel")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(["recent", "tier", "posts", "compte"] as const).map((k) => (
                    <Chip key={k} actif={tri === k} onClick={() => setTri(k)}>
                      {t(`slideshows.tri.${k}`)}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            {!contenus.isPending && (
              <p className="text-[11px] text-muted-foreground">
                {t("slideshows.resultatFiltre", { count: contenusTries.length })}
              </p>
            )}
          </div>

          {contenus.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {!contenus.isPending && contenusTries.length === 0 && (
            <EmptyState
              title={
                filtreLabel ||
                  filtreCompte ||
                  filtreUgc !== "tous" ||
                  filtre !== "tous"
                  ? t("slideshows.emptyFiltre")
                  : t("slideshows.empty")
              }
            />
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(groupesCompte ?? [{ key: "flat", handle: "", items: contenusTries }]).flatMap(
              (groupe) => {
                const header =
                  groupesCompte &&
                  (() => {
                    const st = statsActives.find((s) =>
                      groupe.key === "__none__"
                        ? s.compteReferenceId === null
                        : s.compteReferenceId === groupe.key,
                    );
                    return (
                      <div
                        key={`h-${groupe.key}`}
                        className="col-span-2 flex flex-wrap items-baseline justify-between gap-2 border-b pb-1 sm:col-span-3 lg:col-span-4"
                      >
                        <p className="text-sm font-medium">
                          {groupe.handle
                            ? `@${groupe.handle}`
                            : t("slideshows.sansCompte")}
                        </p>
                        {st && (
                          <p className="text-[11px] text-muted-foreground">
                            {t("slideshows.compteStats", {
                              importes: st.importes,
                              gardes: st.gardes,
                              rejetes: st.rejetes,
                              encours: st.encours,
                            })}
                          </p>
                        )}
                      </div>
                    );
                  })();
                return [
                  ...(header ? [header] : []),
                  ...groupe.items.map((c) => {
              const img = vignette(c);
              const labels = (c.labels ?? [])
                .slice()
                .sort((a, b) =>
                  a.nom.localeCompare(b.nom, undefined, { sensitivity: "base" }),
                );
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    seedSlideshowDetail(queryClient, c.id);
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
                    {handleDuContenu(c, handleParId) ? (
                      <p className="text-[10px] text-muted-foreground">
                        @{handleDuContenu(c, handleParId)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">
                        {t("slideshows.sansCompte")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {labels.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">
                          {t("slideshows.sansLabel")}
                        </span>
                      ) : (
                        labels.slice(0, 3).map((l) => (
                          <span
                            key={l.id}
                            role="button"
                            tabIndex={0}
                            className="rounded border px-1 py-0.5 text-[10px] hover:bg-muted"
                            style={
                              l.couleur
                                ? { borderColor: l.couleur, color: l.couleur }
                                : undefined
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiltreLabel(l.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setFiltreLabel(l.id);
                              }
                            }}
                          >
                            {l.nom}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <BadgeTier tier={c.tier} />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {t("slideshows.passagesRestants", {
                          restants: c.tierEtat?.restants ?? 0,
                          prevus: c.tierEtat?.passages_prevus ?? c.passages_prevus,
                        })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
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
                      {c.creation_mode === "manuel" && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("slideshows.manuelBadge")}
                        </Badge>
                      )}
                      {c.ugc_compatible && (
                        <Badge variant="success" className="gap-0.5 text-[10px]">
                          <Check className="size-2.5" />
                          {t("slideshows.ugcBadge")}
                        </Badge>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {t("slideshows.nbPosts", { count: c.nb_posts ?? 0 })}
                      </span>
                    </div>
                  </div>
                </button>
              );
                  }),
                ];
              },
            )}
          </div>
        </CardContent>
      </Card>

      {ouvert && <DetailSlideshow id={ouvert} onFermer={fermerDetail} />}
    </div>
  );
}
