import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Maximize2, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { AGENTS_UPSCALE, AGENTS_UPSCALE_SEEDVR, executerEnLot } from "@/lib/lot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { NettoyageEtapes } from "@/components/moteur/NettoyageEtapes";
import {
  lireReglages,
  listerBibliothequeParLabels,
  listerLabels,
  nettoyerMedia,
  stripC2paMedia,
  supprimerMedia,
  upscaleMedia,
  type ModeleUpscale,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
  type ProviderNettoyage,
} from "@/features/moteur/nettoyageEtapes";
import type { Media } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-64";

function estPropre(media: Media): boolean {
  // Rangée en propre ET pas signalée par l'audit (texte encore présent).
  return media.storage_path.startsWith("propre/") && !media.texte_restant;
}

function VignetteMedia({
  media,
  onChange,
  selectionne,
  onToggle,
  premier,
  etapesLot,
  modeleUpscale,
}: {
  media: Media;
  onChange: () => void;
  selectionne: boolean;
  onToggle: () => void;
  premier: ProviderNettoyage;
  etapesLot?: EvenementEtape[] | null;
  modeleUpscale: ModeleUpscale;
}) {
  const { t } = useTranslation();
  const propre = estPropre(media);
  const [etapesLocales, setEtapesLocales] = React.useState<EvenementEtape[] | null>(null);
  const etapes = etapesLocales ?? etapesLot ?? null;

  const dejaUpscale = Boolean(media.upscale_le);
  const upscaleBusy = Boolean(etapesLot); // lot nettoyage en cours sur cette vignette

  const nettoyer = useMutation({
    mutationFn: () => {
      setEtapesLocales(etapesInitiales(premier));
      return nettoyerMedia(media.id, (ev) => {
        setEtapesLocales((prev) =>
          appliquerEvenement(prev ?? etapesInitiales(premier), ev, premier),
        );
      });
    },
    onSuccess: () => {
      setEtapesLocales(null);
      onChange();
    },
    onError: () => {
      /* garde la timeline pour voir l'échec */
    },
  });
  const upscale = useMutation({
    mutationFn: () => upscaleMedia(media.id, { modele: modeleUpscale }),
    onSuccess: () => onChange(),
  });
  const supprimer = useMutation({ mutationFn: () => supprimerMedia(media.id), onSuccess: onChange });

  return (
    <div className="space-y-1.5">
      <div className="relative">
        {/* Toute la vignette est cliquable pour (dé)sélectionner : rapide pour
            faire le ménage en masse. */}
        <button
          type="button"
          onClick={onToggle}
          className="block w-full"
          aria-pressed={selectionne}
        >
          <img
            src={media.url}
            alt=""
            className={cn(
              "aspect-[3/4] w-full rounded-md border object-cover transition",
              !propre && "border-2 border-warning/60",
              selectionne && "ring-2 ring-primary ring-offset-2",
            )}
          />
        </button>
        {/* Case à cocher visuelle, coin haut-gauche. */}
        <span
          className={cn(
            "pointer-events-none absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded border bg-background/90 shadow-sm",
            selectionne && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {selectionne && <Check className="size-3.5" />}
        </span>
        {dejaUpscale && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
            {t("bibliotheque.dejaUpscale")}
          </span>
        )}
        {!propre && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-md bg-warning/85 py-0.5 text-center text-[10px] font-medium text-warning-foreground">
            {t("bibliotheque.texteRestant")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {propre ? (
          <Badge variant="success">{t("bibliotheque.nettoyee")}</Badge>
        ) : (
          <Badge variant="warning">{t("bibliotheque.aNettoyer")}</Badge>
        )}
      </div>

      {etapes && (nettoyer.isPending || nettoyer.isError || etapesLot) ? (
        <NettoyageEtapes etapes={etapes} className="rounded border bg-muted/30 p-1.5" />
      ) : null}

      <div className="flex flex-wrap gap-1">
        {media.contenu_id && (
          <Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" asChild>
            <Link to={`/admin/slideshows?id=${media.contenu_id}`}>
              <ExternalLink className="size-3" />
              {t("bibliotheque.ouvrirSlideshow")}
            </Link>
          </Button>
        )}
        {!propre && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 px-2 text-xs"
            disabled={nettoyer.isPending || Boolean(etapesLot)}
            onClick={() => nettoyer.mutate()}
          >
            <Sparkles className="size-3" />
            {nettoyer.isPending || etapesLot
              ? t("bibliotheque.nettoyageEnCours")
              : t("bibliotheque.nettoyer")}
          </Button>
        )}
        {!dejaUpscale && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 px-2 text-xs"
            disabled={upscale.isPending || upscaleBusy}
            onClick={() => upscale.mutate()}
            title={
              modeleUpscale === "seedvr"
                ? t("bibliotheque.upscaleAideSeedvr")
                : t("bibliotheque.upscaleAideRealesrgan")
            }
          >
            <Maximize2 className="size-3" />
            {upscale.isPending ? t("bibliotheque.upscaleEnCours") : t("bibliotheque.upscale")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          disabled={supprimer.isPending}
          onClick={() => {
            if (window.confirm(t("bibliotheque.confirmSuppr"))) supprimer.mutate();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {nettoyer.data && !nettoyer.data.nettoyee && (
        <p className="text-[11px] text-destructive">{t("bibliotheque.nettoyageEchec")}</p>
      )}
      {upscale.isError && (
        <p className="text-[11px] text-destructive">{(upscale.error as Error).message}</p>
      )}
    </div>
  );
}

export function AdminBibliothequePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [labelId, setLabelId] = React.useState("");
  const [lot, setLot] = React.useState<{ fait: number; total: number } | null>(null);
  const [etapesLot, setEtapesLot] = React.useState<Record<string, EvenementEtape[]>>({});
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [suppr, setSuppr] = React.useState<{ fait: number; total: number } | null>(null);
  const [c2pa, setC2pa] = React.useState<{ fait: number; total: number } | null>(null);
  const [c2paLogs, setC2paLogs] = React.useState<string[]>([]);
  const [upscaleLot, setUpscaleLot] = React.useState<{ fait: number; total: number } | null>(null);
  const [upscaleLogs, setUpscaleLogs] = React.useState<string[]>([]);
  const [modeleUpscale, setModeleUpscale] = React.useState<ModeleUpscale>("realesrgan");

  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const biblio = useQuery({
    queryKey: ["medias-biblio", labelId || "tous"],
    queryFn: () => listerBibliothequeParLabels(labelId || undefined),
  });
  const { data: reglages } = useQuery({
    queryKey: ["reglages"],
    queryFn: lireReglages,
    staleTime: 30_000,
  });
  const premier: ProviderNettoyage = reglages?.nettoyage.provider_principal ?? "fal";

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
    void queryClient.invalidateQueries({ queryKey: ["medias"] });
  };
  const groupes = biblio.data ?? [];
  const affichees = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Media[] = [];
    for (const g of groupes) {
      for (const m of g.medias) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  }, [groupes]);
  const aNettoyerListe = affichees.filter((m) => !estPropre(m));
  const aNettoyer = aNettoyerListe.length;
  const aUpscalerListe = affichees.filter((m) => !m.upscale_le);
  const aUpscaler = aUpscalerListe.length;
  const lotEnCours = lot !== null || c2pa !== null || upscaleLot !== null;

  const basculer = (id: string) =>
    setSelection((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toutSelectionner = () => setSelection(new Set(affichees.map((m) => m.id)));
  const viderSelection = () => setSelection(new Set());

  /** Nettoie tous les visuels à texte via un pool d'agents parallèles. */
  async function nettoyerTout() {
    setLot({ fait: 0, total: aNettoyerListe.length });
    setEtapesLot(
      Object.fromEntries(aNettoyerListe.map((m) => [m.id, etapesInitiales(premier)])),
    );
    await executerEnLot(
      aNettoyerListe,
      (media) =>
        nettoyerMedia(media.id, (ev) => {
          setEtapesLot((prev) => ({
            ...prev,
            [media.id]: appliquerEvenement(
              prev[media.id] ?? etapesInitiales(premier),
              ev,
              premier,
            ),
          }));
        }),
      {
        onProgres: (fait, total) => setLot({ fait, total }),
      },
    );
    setLot(null);
    setEtapesLot({});
    rafraichir();
  }

  /** Supprime toutes les vignettes sélectionnées, en parallèle. */
  async function supprimerSelection() {
    const ids = [...selection];
    if (ids.length === 0) return;
    if (!window.confirm(t("bibliotheque.confirmSupprLot", { count: ids.length }))) return;
    setSuppr({ fait: 0, total: ids.length });
    await executerEnLot(ids, (id) => supprimerMedia(id), {
      onProgres: (fait, total) => setSuppr({ fait, total }),
    });
    setSuppr(null);
    viderSelection();
    rafraichir();
  }

  /** Strip C2PA / Content Credentials sur toutes les photos affichées. */
  async function stripC2paTout() {
    const liste = affichees;
    if (liste.length === 0) return;
    setC2pa({ fait: 0, total: liste.length });
    setC2paLogs([t("bibliotheque.c2paDebut", { count: liste.length })]);
    let retires = 0;
    let sautes = 0;
    let echecs = 0;
    await executerEnLot(
      liste,
      async (media) => {
        try {
          const r = await stripC2paMedia(media.id);
          if (r.retire) {
            retires += 1;
            setC2paLogs((prev) => [
              ...prev,
              `✓ ${media.id.slice(0, 8)} — ${r.detail ?? "C2PA retiré"}`,
            ]);
          } else {
            sautes += 1;
            setC2paLogs((prev) => [
              ...prev,
              `· ${media.id.slice(0, 8)} — ${r.detail ?? "rien à retirer"}`,
            ]);
          }
        } catch (e) {
          echecs += 1;
          setC2paLogs((prev) => [
            ...prev,
            `✗ ${media.id.slice(0, 8)} — ${(e as Error).message}`,
          ]);
        }
      },
      {
        largeur: 4,
        onProgres: (fait, total) => setC2pa({ fait, total }),
      },
    );
    setC2paLogs((prev) => [
      ...prev,
      t("bibliotheque.c2paFin", { retires, sautes, echecs }),
    ]);
    setC2pa(null);
    rafraichir();
  }

  /** Upscale (modèle choisi) — uniquement les photos jamais upscalées. */
  async function upscaleTout() {
    const liste = aUpscalerListe;
    if (liste.length === 0) return;
    const labelModele =
      modeleUpscale === "seedvr"
        ? t("bibliotheque.upscaleSeedvr")
        : t("bibliotheque.upscaleRealesrgan");
    if (
      !window.confirm(
        t("bibliotheque.upscaleConfirm", { count: liste.length, modele: labelModele }),
      )
    ) {
      return;
    }
    setUpscaleLot({ fait: 0, total: liste.length });
    setUpscaleLogs([
      t("bibliotheque.upscaleDebut", { count: liste.length, modele: labelModele }),
    ]);
    let ok = 0;
    let sautes = 0;
    let echecs = 0;
    await executerEnLot(
      liste,
      async (media) => {
        try {
          const r = await upscaleMedia(media.id, { modele: modeleUpscale });
          if (r.saute) {
            sautes += 1;
            setUpscaleLogs((prev) => [
              ...prev,
              `· ${media.id.slice(0, 8)} — ${r.detail ?? "déjà upscalée"}`,
            ]);
          } else if (r.ok) {
            ok += 1;
            setUpscaleLogs((prev) => [
              ...prev,
              `✓ ${media.id.slice(0, 8)} — ${r.detail ?? "ok"}`,
            ]);
          } else {
            echecs += 1;
            setUpscaleLogs((prev) => [
              ...prev,
              `✗ ${media.id.slice(0, 8)} — ${r.error ?? "échec"}`,
            ]);
          }
        } catch (e) {
          echecs += 1;
          setUpscaleLogs((prev) => [
            ...prev,
            `✗ ${media.id.slice(0, 8)} — ${(e as Error).message}`,
          ]);
        }
      },
      {
        largeur:
          modeleUpscale === "seedvr" ? AGENTS_UPSCALE_SEEDVR : AGENTS_UPSCALE,
        onProgres: (fait, total) => setUpscaleLot({ fait, total }),
      },
    );
    setUpscaleLogs((prev) => [
      ...prev,
      t("bibliotheque.upscaleFin", { ok, sautes, echecs }),
    ]);
    setUpscaleLot(null);
    rafraichir();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{t("bibliotheque.title")}</CardTitle>
            <CardDescription>
              {aNettoyer > 0
                ? t("bibliotheque.compteur", { count: aNettoyer })
                : t("bibliotheque.subtitle")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="sr-only">{t("bibliotheque.upscaleModele")}</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={modeleUpscale}
                disabled={lotEnCours}
                onChange={(e) =>
                  setModeleUpscale(
                    e.target.value === "seedvr" ? "seedvr" : "realesrgan",
                  )
                }
                title={
                  modeleUpscale === "seedvr"
                    ? t("bibliotheque.upscaleAideSeedvr")
                    : t("bibliotheque.upscaleAideRealesrgan")
                }
              >
                <option value="realesrgan">{t("bibliotheque.upscaleRealesrgan")}</option>
                <option value="seedvr">{t("bibliotheque.upscaleSeedvr")}</option>
              </select>
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={lotEnCours || affichees.length === 0}
              onClick={() => void stripC2paTout()}
              title={t("bibliotheque.c2paAide")}
            >
              {c2pa
                ? t("bibliotheque.c2paEnCours", { fait: c2pa.fait, total: c2pa.total })
                : t("bibliotheque.c2paTout", { count: affichees.length })}
            </Button>
            {aUpscaler > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={lotEnCours}
                onClick={() => void upscaleTout()}
                title={
                  modeleUpscale === "seedvr"
                    ? t("bibliotheque.upscaleAideSeedvr")
                    : t("bibliotheque.upscaleAideRealesrgan")
                }
              >
                <Maximize2 className="size-4" />
                {upscaleLot
                  ? t("bibliotheque.upscaleLot", {
                      fait: upscaleLot.fait,
                      total: upscaleLot.total,
                    })
                  : t("bibliotheque.upscaleTout", { count: aUpscaler })}
              </Button>
            )}
            {aNettoyer > 0 && (
              <Button size="sm" disabled={lotEnCours} onClick={nettoyerTout}>
                <Sparkles />
                {lot
                  ? t("adminPost.lotEnCours", { fait: lot.fait, total: lot.total })
                  : t("bibliotheque.nettoyerTout", { count: aNettoyer })}
              </Button>
            )}
          </div>
        </div>
        {lot && (
          <p className="pt-1 text-xs text-muted-foreground">{t("adminPost.lotAide")}</p>
        )}
        {c2paLogs.length > 0 && (
          <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed">
            {c2paLogs.map((l, i) => (
              <div key={`c2pa-${i}-${l.slice(0, 12)}`} className="break-words text-muted-foreground">
                {l}
              </div>
            ))}
          </div>
        )}
        {upscaleLogs.length > 0 && (
          <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed">
            {upscaleLogs.map((l, i) => (
              <div key={`up-${i}-${l.slice(0, 12)}`} className="break-words text-muted-foreground">
                {l}
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("labels.title")}
            className={selectClass}
            value={labelId}
            onChange={(e) => {
              setLabelId(e.target.value);
              viderSelection();
            }}
          >
            <option value="">{t("bibliotheque.tousLabels")}</option>
            {(labels.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>

          {affichees.length > 0 && (
            <Button size="sm" variant="outline" onClick={toutSelectionner}>
              {t("bibliotheque.toutSelectionner", { count: affichees.length })}
            </Button>
          )}
        </div>

        {/* Barre d'actions de sélection : n'apparaît que si des visuels sont cochés. */}
        {selection.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5">
            <span className="text-sm font-medium">
              {t("bibliotheque.selection", { count: selection.size })}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={viderSelection} disabled={suppr !== null}>
                {t("bibliotheque.toutDeselectionner")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={supprimerSelection}
                disabled={suppr !== null}
              >
                <Trash2 className="size-4" />
                {suppr
                  ? t("bibliotheque.suppressionLot", { fait: suppr.fait, total: suppr.total })
                  : t("bibliotheque.supprimerSelection", { count: selection.size })}
              </Button>
            </div>
          </div>
        )}

        {biblio.isPending && (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
        {biblio.isError && (
          <p className="text-sm text-destructive">{(biblio.error as Error).message}</p>
        )}
        {!biblio.isPending && affichees.length === 0 && (
          <EmptyState title={t("bibliotheque.empty")} />
        )}

        <div className="space-y-8">
          {groupes.map((groupe) => {
            const key = groupe.label?.id ?? "__sans__";
            return (
              <section key={key} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                  {groupe.label ? (
                    <h3 className="text-base font-semibold tracking-tight">
                      {groupe.label.nom}
                    </h3>
                  ) : (
                    <h3 className="text-base font-semibold tracking-tight text-muted-foreground">
                      {t("bibliotheque.sansLabel")}
                    </h3>
                  )}
                  <Badge variant="secondary">
                    {t("bibliotheque.nbPhotos", { count: groupe.medias.length })}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {groupe.medias.map((media) => (
                    <VignetteMedia
                      key={`${key}-${media.id}`}
                      media={media}
                      onChange={rafraichir}
                      selectionne={selection.has(media.id)}
                      onToggle={() => basculer(media.id)}
                      premier={premier}
                      etapesLot={etapesLot[media.id] ?? null}
                      modeleUpscale={modeleUpscale}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
