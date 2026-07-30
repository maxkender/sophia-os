import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
} from "lucide-react";

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
import { aujourdhui, postsCalendrierAdmin, supprimerPost, type PostCalendrierAdmin } from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

function ajouterJours(yyyyMmDd: string, delta: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nomCreateur(post: PostCalendrierAdmin): string {
  const perso = [post.poster_prenom, post.poster_nom].filter(Boolean).join(" ");
  return perso || post.persona_nom || (post.handle_tiktok ? `@${post.handle_tiktok}` : "—");
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

export function AdminCalendrierPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [date, setDate] = React.useState(aujourdhui);
  const [filtreLangue, setFiltreLangue] = React.useState("");

  const { data: posts, isPending } = useQuery({
    queryKey: ["posts-calendrier-admin"],
    queryFn: postsCalendrierAdmin,
  });

  const supprimer = useMutation({
    mutationFn: supprimerPost,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts-calendrier-admin"] }),
  });

  const langues = React.useMemo(
    () => [...new Set((posts ?? []).map((p) => p.langue).filter(Boolean))].sort() as string[],
    [posts],
  );

  const duJour = React.useMemo(() => {
    const list = (posts ?? []).filter((p) => p.date_publication_prevue === date);
    return filtreLangue ? list.filter((p) => p.langue === filtreLangue) : list;
  }, [posts, date, filtreLangue]);

  const parCreateur = React.useMemo(() => {
    const map = new Map<string, PostCalendrierAdmin[]>();
    for (const p of duJour) {
      const list = map.get(p.compte_id) ?? [];
      list.push(p);
      map.set(p.compte_id, list);
    }
    return [...map.entries()]
      .map(([compteId, postsCompte]) => ({
        compteId,
        posts: postsCompte,
        nom: nomCreateur(postsCompte[0]!),
        handle: postsCompte[0]?.handle_tiktok ?? null,
        avatar: postsCompte[0]?.avatar_url ?? null,
        langue: postsCompte[0]?.langue ?? null,
        postes: postsCompte.filter(estPoste).length,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, i18n.language));
  }, [duJour, i18n.language]);

  const prevus = duJour.length;
  const postes = duJour.filter(estPoste).length;
  const labelDate = new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const estAujourdhui = date === aujourdhui();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("adminCal.titre")}</CardTitle>
          <CardDescription>{t("adminCal.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("adminCal.jour")}</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("adminCal.jourPrecedent")}
                onClick={() => setDate((d) => ajouterJours(d, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="sm"
                variant={estAujourdhui ? "secondary" : "outline"}
                onClick={() => setDate(aujourdhui())}
              >
                {t("calendrier.revenirAujourdhui")}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("adminCal.jourSuivant")}
                onClick={() => setDate((d) => ajouterJours(d, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            {langues.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("calendrier.filtreLangue")}
                </label>
                <select
                  aria-label={t("calendrier.filtreLangue")}
                  value={filtreLangue}
                  onChange={(e) => setFiltreLangue(e.target.value)}
                  className="flex h-9 w-44 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{t("calendrier.toutesLangues")}</option>
                  {langues.map((l) => (
                    <option key={l} value={l}>
                      {nomLangue(l)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="text-sm capitalize text-muted-foreground">{labelDate}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("adminCal.statsPrevus")}</p>
              <p className="text-2xl font-semibold tabular-nums">{prevus}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("adminCal.statsPostes")}</p>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  postes === prevus && prevus > 0 ? "text-success" : "",
                )}
              >
                {postes}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("adminCal.statsRestants")}</p>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  prevus - postes > 0 ? "text-warning" : "text-success",
                )}
              >
                {Math.max(0, prevus - postes)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("adminCal.statsCreateurs")}</p>
              <p className="text-2xl font-semibold tabular-nums">{parCreateur.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminCal.parCreateur")}</CardTitle>
          <CardDescription>{t("adminCal.parCreateurDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!isPending && parCreateur.length === 0 && (
            <EmptyState title={t("adminCal.videJour")} />
          )}

          {parCreateur.map((groupe) => (
            <div key={groupe.compteId} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {groupe.avatar ? (
                      <img src={groupe.avatar} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{groupe.nom}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {groupe.handle ? `@${groupe.handle}` : "—"}
                      {groupe.langue ? ` · ${groupe.langue.toUpperCase()}` : ""}
                    </p>
                  </div>
                </div>
                <Badge variant={groupe.postes === groupe.posts.length ? "success" : "warning"}>
                  {t("adminCal.faitSur", { faits: groupe.postes, total: groupe.posts.length })}
                </Badge>
              </div>

              <ul className="space-y-1.5">
                {groupe.posts.map((post) => {
                  const poste = estPoste(post);
                  return (
                    <li
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
                            <a
                              href={post.publie_url}
                              target="_blank"
                              rel="noreferrer"
                              title={t("adminCal.voirTiktok")}
                            >
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
                          className="size-8 text-destructive hover:bg-destructive/10"
                          aria-label={t("common.delete")}
                          disabled={supprimer.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                t("adminCal.confirmSuppr", { nom: nomCreateur(post) }),
                              )
                            ) {
                              supprimer.mutate(post.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
