import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  chargerPilotageDashboard,
  creerLabel,
  listerLabels,
  majLabel,
  supprimerLabel,
} from "@/features/moteur/api";
import type { LabelGenre } from "@/features/moteur/types";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function abrege(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function LabelsPilotageCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const [nom, setNom] = React.useState("");
  const [couleur, setCouleur] = React.useState("#2f6f4e");
  const [genre, setGenre] = React.useState<LabelGenre>("femme");
  const [ugcAiVideo, setUgcAiVideo] = React.useState(false);

  const creer = useMutation({
    mutationFn: () =>
      creerLabel(nom.trim(), couleur, { ugc_ai_video: ugcAiVideo, genre }),
    onSuccess: () => {
      setNom("");
      setGenre("femme");
      setUgcAiVideo(false);
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
  });
  const changerGenre = useMutation({
    mutationFn: (input: { id: string; genre: LabelGenre }) =>
      majLabel(input.id, { genre: input.genre }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });
  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerLabel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("labels.gestion")}</CardTitle>
        <CardDescription>{t("labels.gestionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nom.trim()) creer.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="labNom">{t("labels.nom")}</Label>
            <Input id="labNom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="labCoul">{t("labels.couleur")}</Label>
            <Input
              id="labCoul"
              type="color"
              className="h-9 w-14 p-1"
              value={couleur}
              onChange={(e) => setCouleur(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="labGenre">{t("labels.genre")}</Label>
            <select
              id="labGenre"
              className={selectClass}
              value={genre}
              onChange={(e) => setGenre(e.target.value as LabelGenre)}
            >
              <option value="femme">{t("labels.genreFemme")}</option>
              <option value="homme">{t("labels.genreHomme")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs">
            <input
              type="checkbox"
              checked={ugcAiVideo}
              onChange={(e) => setUgcAiVideo(e.target.checked)}
            />
            {t("labels.ugcAiVideo")}
          </label>
          <Button type="submit" disabled={creer.isPending || !nom.trim()}>
            {creer.isPending ? t("common.saving") : t("labels.creer")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">{t("labels.genreAide")}</p>
        <p className="text-xs text-muted-foreground">{t("labels.ugcAiVideoAide")}</p>
        <div className="list-enter flex flex-wrap gap-2">
          {(labels.data ?? []).map((lab) => (
            <div
              key={lab.id}
              className="flex items-center gap-1.5 border border-border/80 px-2 py-1 text-xs"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: lab.couleur ?? "#888" }}
              />
              <span className="font-medium">{lab.nom}</span>
              <select
                className="h-7 rounded border border-input bg-background px-1 text-[11px]"
                value={lab.genre === "homme" ? "homme" : "femme"}
                disabled={changerGenre.isPending}
                title={t("labels.genre")}
                onChange={(e) =>
                  changerGenre.mutate({
                    id: lab.id,
                    genre: e.target.value as LabelGenre,
                  })
                }
              >
                <option value="femme">{t("labels.genreFemme")}</option>
                <option value="homme">{t("labels.genreHomme")}</option>
              </select>
              {lab.ugc_ai_video && (
                <Badge variant="outline" className="text-[10px]">
                  {t("labels.ugcAiVideoBadge")}
                </Badge>
              )}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(t("labels.confirmDelete"))) supprimer.mutate(lab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Courbe des Δ vues journaliers (j0 − j1), figés à l’update ELO. */
function GraphVuesDelta({
  serie,
}: {
  serie: Array<{ jour: string; vues_delta: number | null; vues_totales: number }>;
}) {
  const { t, i18n } = useTranslation();
  // Recalcule un Δ d’affichage si le snapshot l’a laissé null (trou d’un jour).
  const points = serie
    .map((s, i) => {
      if (s.vues_delta != null) return { ...s, vues_delta: s.vues_delta };
      const prev = i > 0 ? serie[i - 1] : null;
      if (!prev) return { ...s, vues_delta: null as number | null };
      return { ...s, vues_delta: s.vues_totales - prev.vues_totales };
    })
    .filter((s): s is typeof s & { vues_delta: number } => s.vues_delta != null);

  if (serie.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("pilotage.vuesVide")}</p>
    );
  }
  if (points.length === 0) {
    const last = serie[serie.length - 1]!;
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t("pilotage.vuesSansDelta")}</p>
        <p className="text-sm">
          <span className="text-muted-foreground">{t("pilotage.totalVues", { n: abrege(last.vues_totales) })}</span>
          <span className="text-muted-foreground"> · {last.jour}</span>
        </p>
      </div>
    );
  }
  const max = Math.max(...points.map((p) => Math.abs(p.vues_delta)), 1);
  /** Hauteur fixe en px — un % sur parent `height: auto` donnait des barres à 0. */
  const chartH = 160;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5" style={{ height: chartH }}>
        {points.map((p) => {
          const d = p.vues_delta;
          const hPx = Math.max(6, Math.round((Math.abs(d) / max) * chartH));
          return (
            <div
              key={p.jour}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              title={`${p.jour}: ${d >= 0 ? "+" : ""}${abrege(d)}`}
            >
              <div
                className={cn(
                  "w-full max-w-[36px] rounded-t-sm transition-colors",
                  d >= 0 ? "bg-emerald-600/80 group-hover:bg-emerald-600" : "bg-amber-600/80",
                )}
                style={{ height: hPx }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          {new Date(`${points[0]!.jour}T12:00:00`).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "short",
          })}
        </span>
        <span>
          {new Date(`${points[points.length - 1]!.jour}T12:00:00`).toLocaleDateString(
            i18n.language,
            { day: "numeric", month: "short" },
          )}
        </span>
      </div>
      {(() => {
        const last = points[points.length - 1]!;
        return (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("pilotage.dernierDelta")} </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                last.vues_delta >= 0 ? "text-success" : "text-warning",
              )}
            >
              {last.vues_delta >= 0 ? "+" : ""}
              {abrege(last.vues_delta)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {t("pilotage.totalVues", { n: abrege(last.vues_totales) })}
            </span>
          </p>
        );
      })()}
    </div>
  );
}

function RangList({
  title,
  desc,
  empty,
  children,
}: {
  title: string;
  desc: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {empty ? <EmptyState title={t("pilotage.vide")} /> : children}
      </CardContent>
    </Card>
  );
}

export function AdminPilotagePage() {
  const { t } = useTranslation();
  const dash = useQuery({
    queryKey: ["pilotage-dashboard"],
    queryFn: chargerPilotageDashboard,
  });

  const d = dash.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("pilotage.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pilotage.subtitleNew")}</p>
      </div>

      {dash.isPending && (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
      {dash.isError && (
        <p className="text-sm text-destructive">
          {(dash.error as Error).message || t("common.error")}
        </p>
      )}

      {d && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("pilotage.vuesTitre")}</CardTitle>
              <CardDescription>{t("pilotage.vuesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <GraphVuesDelta serie={d.vuesSerie} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <RangList
              title={t("pilotage.eloBasTitre")}
              desc={t("pilotage.eloBasDesc")}
              empty={d.eloBas.length === 0}
            >
              {d.eloBas.map((c, i) => (
                <Link
                  key={c.compte_id}
                  to={`/admin/createurs/${c.compte_id}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {c.nom}
                    {c.handle ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">@{c.handle}</span>
                    ) : null}
                  </span>
                  <Badge variant="secondary">ELO {c.score.toFixed(1)}</Badge>
                </Link>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.eloTopTitre")}
              desc={t("pilotage.eloTopDesc")}
              empty={d.eloTop.length === 0}
            >
              {d.eloTop.map((c, i) => (
                <Link
                  key={c.compte_id}
                  to={`/admin/createurs/${c.compte_id}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {c.nom}
                    {c.handle ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">@{c.handle}</span>
                    ) : null}
                  </span>
                  <Badge variant="secondary">ELO {c.score.toFixed(1)}</Badge>
                </Link>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.recruteursTitre")}
              desc={t("pilotage.recruteursDesc")}
              empty={d.recruteurs.length === 0}
            >
              {d.recruteurs.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {r.nom}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {t("pilotage.nbCreateurs", { n: r.nbCreateurs })}
                    </span>
                  </span>
                  <Badge variant="secondary">ELO {r.eloMoyen.toFixed(1)}</Badge>
                </div>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.postsVeilleTitre")}
              desc={t("pilotage.postsVeilleDesc")}
              empty={d.postsVeille.length === 0}
            >
              {d.postsVeille.map((p, i) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {p.titre?.trim() || t("posts.title")}
                    {p.handle ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">@{p.handle}</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">{abrege(p.vues)}</span>
                    {p.publie_url && (
                      <a
                        href={p.publie_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </RangList>
          </div>
        </>
      )}

      <LabelsPilotageCard />
    </div>
  );
}
