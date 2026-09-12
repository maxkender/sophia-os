import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BadgeClassement } from "@/features/moteur/BadgeClassement";
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
import { Textarea } from "@/components/ui/textarea";
import {
  chargerPilotageDashboard,
  creerApplication,
  creerLabel,
  listerLabels,
  majLabel,
  supprimerLabel,
} from "@/features/moteur/api";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { estSlugApplicationValide, nomApplication } from "@/features/moteur/applications";
import {
  exemplesFeedDepuisTexte,
  exemplesFeedVersTexte,
} from "@/features/moteur/creationManuelle";
import type { Label as LabelMoteur, LabelGenre } from "@/features/moteur/types";
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
  const { applicationId, application, applications, setSlug } = useApplication();
  const labels = useQuery({
    queryKey: ["labels", applicationId],
    queryFn: () => listerLabels(applicationId),
    enabled: Boolean(applicationId),
  });
  const [nouveauSlug, setNouveauSlug] = React.useState("");
  const [nouveauNom, setNouveauNom] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [couleur, setCouleur] = React.useState("#2f6f4e");
  const [genre, setGenre] = React.useState<LabelGenre>("femme");
  const [ugcAiVideo, setUgcAiVideo] = React.useState(false);

  const creer = useMutation({
    mutationFn: () =>
      creerLabel(nom.trim(), couleur, {
        ugc_ai_video: ugcAiVideo,
        genre,
        application_id: applicationId,
      }),
    onSuccess: () => {
      setNom("");
      setGenre("femme");
      setUgcAiVideo(false);
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
  });
  const creerApp = useMutation({
    mutationFn: () => creerApplication({ slug: nouveauSlug, nom: nouveauNom }),
    onSuccess: (app) => {
      setNouveauSlug("");
      setNouveauNom("");
      setSlug(app.slug);
      qc.invalidateQueries({ queryKey: ["applications"] });
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
          className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (estSlugApplicationValide(nouveauSlug.trim().toLowerCase())) creerApp.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="appSlug">{t("applications.slug")}</Label>
            <Input
              id="appSlug"
              value={nouveauSlug}
              placeholder="micabo"
              onChange={(e) => setNouveauSlug(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="appNom">{t("applications.nom")}</Label>
            <Input
              id="appNom"
              value={nouveauNom}
              placeholder="micabo"
              onChange={(e) => setNouveauNom(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={creerApp.isPending}>
            {t("applications.creer")}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            {t("applications.liste", {
              noms: applications.map((a) => nomApplication(a)).join(", "),
              actuelle: application ? nomApplication(application) : "—",
            })}
          </p>
          {creerApp.isError && (
            <p className="w-full text-xs text-destructive">
              {(creerApp.error as Error).message}
            </p>
          )}
        </form>
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
              <Link
                to={`/admin/creation?label=${lab.id}`}
                className="text-[10px] text-primary underline-offset-2 hover:underline"
              >
                {t("labels.creerPost")}
              </Link>
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

function LabelStyleCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { applicationId } = useApplication();
  const labels = useQuery({
    queryKey: ["labels", applicationId],
    queryFn: () => listerLabels(applicationId),
    enabled: Boolean(applicationId),
  });
  const [labelId, setLabelId] = React.useState("");
  const [styleTheme, setStyleTheme] = React.useState("");
  const [promptCreation, setPromptCreation] = React.useState("");
  const [feed, setFeed] = React.useState("");

  const choisi = (labels.data ?? []).find((l) => l.id === labelId) ?? null;

  React.useEffect(() => {
    if (!choisi) {
      setStyleTheme("");
      setPromptCreation("");
      setFeed("");
      return;
    }
    setStyleTheme(choisi.style_theme ?? "");
    setPromptCreation(choisi.prompt_creation ?? "");
    setFeed(exemplesFeedVersTexte(choisi.exemples_feed));
  }, [choisi]);

  const sauver = useMutation({
    mutationFn: () =>
      majLabel(labelId, {
        style_theme: styleTheme.trim() || null,
        prompt_creation: promptCreation.trim() || null,
        exemples_feed: exemplesFeedDepuisTexte(feed),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("labels.styleTheme")}</CardTitle>
        <CardDescription>{t("labels.styleThemeAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="labStyle">{t("creation.label")}</Label>
          <select
            id="labStyle"
            className={selectClass}
            value={labelId}
            onChange={(e) => setLabelId(e.target.value)}
          >
            <option value="">{t("creation.choisirLabel")}</option>
            {(labels.data ?? []).map((l: LabelMoteur) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="labTheme">{t("labels.styleTheme")}</Label>
          <Textarea
            id="labTheme"
            rows={3}
            value={styleTheme}
            onChange={(e) => setStyleTheme(e.target.value)}
            disabled={!labelId}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="labPrompt">{t("labels.promptCreation")}</Label>
          <p className="text-[11px] text-muted-foreground">{t("labels.promptCreationAide")}</p>
          <Textarea
            id="labPrompt"
            rows={4}
            value={promptCreation}
            onChange={(e) => setPromptCreation(e.target.value)}
            disabled={!labelId}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="labFeed">{t("labels.feed")}</Label>
          <p className="text-[11px] text-muted-foreground">{t("labels.feedAide")}</p>
          <Textarea
            id="labFeed"
            rows={6}
            value={feed}
            onChange={(e) => setFeed(e.target.value)}
            disabled={!labelId}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!labelId || sauver.isPending}
            onClick={() => sauver.mutate()}
          >
            {sauver.isPending ? t("common.saving") : t("labels.enregistrerStyle")}
          </Button>
          {labelId ? (
            <Link
              to={`/admin/creation?label=${labelId}`}
              className="text-sm text-primary underline underline-offset-2"
            >
              {t("labels.creerPost")}
            </Link>
          ) : null}
          {sauver.isError && (
            <p className="text-sm text-destructive">{(sauver.error as Error).message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Courbe des vues quotidiennes (totaux snapshot) — survol = vues exactes. */
function GraphVuesDelta({
  serie,
}: {
  serie: Array<{ jour: string; vues_delta: number | null; vues_totales: number }>;
}) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = React.useState<number | null>(null);

  if (serie.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("pilotage.vuesVide")}</p>
    );
  }

  const points = serie;
  const vals = points.map((p) => p.vues_totales);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const pad = (maxV - minV) * 0.1 || Math.max(maxV * 0.05, 1);
  const yMin = Math.max(0, minV - pad);
  const yMax = maxV + pad;

  const W = 640;
  const H = 168;
  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 10;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const coords = points.map((p, i) => {
    const x =
      padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y =
      padT + innerH - ((p.vues_totales - yMin) / (yMax - yMin || 1)) * innerH;
    return { ...p, x, y };
  });

  const pathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const fmtExact = (n: number) =>
    Math.round(n).toLocaleString(i18n.language === "fr" ? "fr-FR" : "en-US");
  const fmtJour = (jour: string) =>
    new Date(`${jour}T12:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
    });

  const last = points[points.length - 1]!;
  const lastDelta = (() => {
    if (last.vues_delta != null) return last.vues_delta;
    if (points.length < 2) return null;
    return last.vues_totales - points[points.length - 2]!.vues_totales;
  })();
  const tip = hover != null ? coords[hover]! : null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full overflow-visible"
          role="img"
          aria-label={t("pilotage.vuesTitre")}
        >
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-emerald-700"
          />
          {coords.map((c, i) => (
            <g key={c.jour}>
              {/* Zone de survol élargie */}
              <circle
                cx={c.x}
                cy={c.y}
                r={14}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r={hover === i ? 5.5 : 3.5}
                className={cn(
                  "pointer-events-none fill-emerald-700 stroke-background",
                  hover === i ? "stroke-[2.5]" : "stroke-2",
                )}
              />
            </g>
          ))}
        </svg>
        {tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-lifted"
            style={{
              left: `${(tip.x / W) * 100}%`,
              top: `${(tip.y / H) * 100}%`,
            }}
          >
            <p className="font-medium text-foreground">{fmtJour(tip.jour)}</p>
            <p className="tabular-nums text-muted-foreground">
              {t("pilotage.vuesExactes", { n: fmtExact(tip.vues_totales) })}
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{fmtJour(points[0]!.jour)}</span>
        <span>{fmtJour(last.jour)}</span>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">
          {t("pilotage.totalVues", { n: fmtExact(last.vues_totales) })}
        </span>
        {lastDelta != null && (
          <>
            <span className="text-muted-foreground"> · {t("pilotage.dernierDelta")} </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                lastDelta >= 0 ? "text-success" : "text-warning",
              )}
            >
              {lastDelta >= 0 ? "+" : ""}
              {fmtExact(lastDelta)}
            </span>
          </>
        )}
      </p>
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
              title={t("pilotage.classementBasTitre")}
              desc={t("pilotage.classementBasDesc")}
              empty={d.classementBas.length === 0}
            >
              {d.classementBas.map((c, i) => (
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
                  <BadgeClassement classement={c.classement} />
                </Link>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.classementTopTitre")}
              desc={t("pilotage.classementTopDesc")}
              empty={d.classementTop.length === 0}
            >
              {d.classementTop.map((c, i) => (
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
                  <BadgeClassement classement={c.classement} />
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
                  <Badge variant="secondary" title={t("pilotage.partBienAide")}>
                    {t("pilotage.partBien", { pct: Math.round(r.partBien * 100) })}
                  </Badge>
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
      <LabelStyleCard />
    </div>
  );
}
