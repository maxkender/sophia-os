import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { executerEnLot } from "@/lib/lot";
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
  listerMedias,
  listerSources,
  nettoyerMedia,
  stripC2paMedia,
  supprimerMedia,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
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
  etapesLot,
}: {
  media: Media;
  onChange: () => void;
  selectionne: boolean;
  onToggle: () => void;
  etapesLot?: EvenementEtape[] | null;
}) {
  const { t } = useTranslation();
  const propre = estPropre(media);
  const [etapesLocales, setEtapesLocales] = React.useState<EvenementEtape[] | null>(null);
  const etapes = etapesLocales ?? etapesLot ?? null;

  const nettoyer = useMutation({
    mutationFn: () => {
      setEtapesLocales(etapesInitiales());
      return nettoyerMedia(media.id, (ev) => {
        setEtapesLocales((prev) => appliquerEvenement(prev ?? etapesInitiales(), ev));
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
    </div>
  );
}

export function AdminBibliothequePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sourceId, setSourceId] = React.useState("");
  const [lot, setLot] = React.useState<{ fait: number; total: number } | null>(null);
  const [etapesLot, setEtapesLot] = React.useState<Record<string, EvenementEtape[]>>({});
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [suppr, setSuppr] = React.useState<{ fait: number; total: number } | null>(null);
  const [c2pa, setC2pa] = React.useState<{ fait: number; total: number } | null>(null);
  const [c2paLogs, setC2paLogs] = React.useState<string[]>([]);

  const sources = useQuery({ queryKey: ["sources"], queryFn: listerSources });
  const medias = useQuery({
    queryKey: ["medias", sourceId || "tous"],
    queryFn: () => listerMedias(sourceId || undefined),
  });

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["medias"] });
  const aNettoyerListe = (medias.data ?? []).filter((m) => !estPropre(m));
  const aNettoyer = aNettoyerListe.length;
  const affichees = medias.data ?? [];

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
      Object.fromEntries(aNettoyerListe.map((m) => [m.id, etapesInitiales()])),
    );
    await executerEnLot(
      aNettoyerListe,
      (media) =>
        nettoyerMedia(media.id, (ev) => {
          setEtapesLot((prev) => ({
            ...prev,
            [media.id]: appliquerEvenement(prev[media.id] ?? etapesInitiales(), ev),
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
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={c2pa !== null || affichees.length === 0}
              onClick={() => void stripC2paTout()}
              title={t("bibliotheque.c2paAide")}
            >
              {c2pa
                ? t("bibliotheque.c2paEnCours", { fait: c2pa.fait, total: c2pa.total })
                : t("bibliotheque.c2paTout", { count: affichees.length })}
            </Button>
            {aNettoyer > 0 && (
              <Button size="sm" disabled={lot !== null} onClick={nettoyerTout}>
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
              <div key={`${i}-${l.slice(0, 12)}`} className="break-words text-muted-foreground">
                {l}
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("comptes.source")}
            className={selectClass}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">{t("bibliotheque.toutes")}</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                @{s.handle_tiktok}
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

        {medias.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {medias.data?.length === 0 && <EmptyState title={t("bibliotheque.empty")} />}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {affichees.map((media) => (
            <VignetteMedia
              key={media.id}
              media={media}
              onChange={rafraichir}
              selectionne={selection.has(media.id)}
              onToggle={() => basculer(media.id)}
              etapesLot={etapesLot[media.id] ?? null}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
