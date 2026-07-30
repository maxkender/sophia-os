import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Trash2,
} from "lucide-react";

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
import {
  lireCompteCreateur,
  listerPublicationsCompte,
  postsCalendrierAdmin,
  supprimerPost,
  type PostCalendrierAdmin,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

function abrege(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function estPoste(post: PostCalendrierAdmin): boolean {
  return post.statut === "publie" || Boolean(post.publie_at) || Boolean(post.publie_url);
}

function badgePipeline(statut: string) {
  if (statut === "done") return "success" as const;
  if (statut === "failed") return "destructive" as const;
  if (statut === "running" || statut === "pending") return "warning" as const;
  return "secondary" as const;
}

function Tuile({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{valeur}</p>
    </div>
  );
}

export function AdminCreateurPage() {
  const { t, i18n } = useTranslation();
  const { compteId = "" } = useParams();
  const [params] = useSearchParams();
  const date = params.get("date");
  const queryClient = useQueryClient();

  const createur = useQuery({
    queryKey: ["compte-createur", compteId],
    queryFn: () => lireCompteCreateur(compteId),
    enabled: Boolean(compteId),
  });

  const posts = useQuery({
    queryKey: ["posts-calendrier-admin"],
    queryFn: postsCalendrierAdmin,
    enabled: Boolean(date),
  });

  const pubs = useQuery({
    queryKey: ["publications-compte", compteId],
    queryFn: () => listerPublicationsCompte(compteId),
    enabled: Boolean(compteId),
  });

  const supprimer = useMutation({
    mutationFn: supprimerPost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts-calendrier-admin"] });
    },
  });

  const postsDuJour = React.useMemo(() => {
    if (!date) return [];
    return (posts.data ?? []).filter(
      (p) => p.compte_id === compteId && p.date_publication_prevue === date,
    );
  }, [posts.data, compteId, date]);

  const c = createur.data;
  const stats = c?.stats;
  const nom =
    [c?.poster_prenom, c?.poster_nom].filter(Boolean).join(" ") ||
    c?.persona_nom ||
    (c?.handle_tiktok ? `@${c.handle_tiktok}` : "—");
  const tiktok = c?.handle_tiktok
    ? `https://www.tiktok.com/@${c.handle_tiktok.replace(/^@/, "")}`
    : null;
  const labelDate = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  if (createur.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!c) {
    return <EmptyState title={t("adminCreateur.introuvable")} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/admin/calendrier">
            <ArrowLeft className="mr-1.5 size-4" />
            {t("adminCreateur.retour")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 pt-6">
          <div className="size-16 shrink-0 overflow-hidden rounded-full bg-muted">
            {c.avatar_url ? (
              <img src={c.avatar_url} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{nom}</h1>
              {!c.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
              <Badge variant="outline">{nomLangue(c.langue)}</Badge>
              <Badge variant="secondary" title={t("adminCreateur.eloAide")}>
                {t("adminCreateur.elo", { score: c.score.toFixed(1) })}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {c.handle_tiktok && <span>@{c.handle_tiktok.replace(/^@/, "")}</span>}
              {c.poster_email && <span>{c.poster_email}</span>}
              {c.score_maj_at && (
                <span className="text-xs">
                  {t("adminCreateur.eloMaj", {
                    date: new Date(c.score_maj_at).toLocaleString(i18n.language),
                  })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {tiktok && (
                <Button size="sm" variant="outline" asChild>
                  <a href={tiktok} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 size-3.5" />
                    {t("adminCreateur.compteTiktok")}
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link to="/admin/posters">{t("adminCreateur.voirPosters")}</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminCreateur.statsTitre")}</CardTitle>
          <CardDescription>{t("adminCreateur.statsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <p className="text-sm text-muted-foreground">{t("adminCreateur.statsVide")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tuile label={t("analytics.vues")} valeur={abrege(Number(stats.vues_totales))} />
              <Tuile label={t("analytics.likes")} valeur={abrege(Number(stats.likes_totaux))} />
              <Tuile
                label={t("adminCreateur.vuesMoy")}
                valeur={abrege(Number(stats.vues_moyennes))}
              />
              <Tuile
                label={t("analytics.publies")}
                valeur={`${stats.posts_publies}/${stats.posts_total}`}
              />
              <Tuile
                label={t("analytics.enAttente")}
                valeur={String(stats.posts_en_attente)}
              />
              <Tuile
                label={t("analytics.sansLien", { count: Number(stats.posts_sans_lien) })}
                valeur={String(stats.posts_sans_lien)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {date && (
        <Card>
          <CardHeader>
            <CardTitle>{t("adminCreateur.postsJour")}</CardTitle>
            <CardDescription className="capitalize">{labelDate}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {posts.isPending && (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            )}
            {!posts.isPending && postsDuJour.length === 0 && (
              <EmptyState title={t("adminCreateur.aucunPostJour")} />
            )}
            {postsDuJour.map((post) => {
              const poste = estPoste(post);
              return (
                <div
                  key={post.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Badge variant={poste ? "success" : "outline"}>
                      {poste ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="size-3" />
                          {t("adminCal.poste")}
                        </span>
                      ) : (
                        t("adminCal.prevu")
                      )}
                    </Badge>
                    <Badge variant="secondary">{t(`type.${post.type}`)}</Badge>
                    <Badge variant={badgePipeline(post.pipeline_statut)}>
                      {t(`statut.${post.pipeline_statut}`)}
                    </Badge>
                    {post.sujet_titre && (
                      <span className="truncate text-xs text-muted-foreground">
                        {post.sujet_titre}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {post.publie_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={post.publie_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 size-3.5" />
                          {t("adminCal.voirTiktok")}
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/admin/posts/${post.id}`}>{t("adminCal.voirPost")}</Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn("size-8 text-destructive hover:bg-destructive/10")}
                      aria-label={t("common.delete")}
                      disabled={supprimer.isPending}
                      onClick={() => {
                        if (window.confirm(t("adminCal.confirmSuppr", { nom }))) {
                          supprimer.mutate(post.id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("adminCreateur.historique")}</CardTitle>
          <CardDescription>{t("adminCreateur.historiqueDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pubs.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {!pubs.isPending && (pubs.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t("adminCreateur.historiqueVide")}</p>
          )}
          {(pubs.data ?? []).map((p) => (
            <div
              key={p.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.titre?.trim() || t("posts.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    p.date_publication_prevue
                      ? new Date(p.date_publication_prevue).toLocaleDateString(i18n.language)
                      : p.publie_at
                        ? new Date(p.publie_at).toLocaleDateString(i18n.language)
                        : null,
                    p.langue ? nomLangue(p.langue) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {p.publie_url ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={p.publie_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 size-3.5" />
                    {t("adminCal.voirTiktok")}
                  </a>
                </Button>
              ) : (
                <Badge variant="warning">{t("posters.lienManquant")}</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
