import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight, Flame, LinkIcon, RefreshCw, TrendingUp } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { lancerMetriques, statsComptes, statsPosts } from "@/features/moteur/api";
import type { StatsPost } from "@/features/moteur/types";

/** Un post « viral » : ≥ 7 jours après publication (N+7) ET plus de 30 000 vues.
 *  Le signal que ce contenu a vraiment percé — à repérer pour le rejouer. */
const SEUIL_VIRAL = 30_000;
const JOURS_VIRAL = 7;
function estViral(p: StatsPost): boolean {
  if (!p.publie_at || p.vues == null) return false;
  const jours = (Date.now() - new Date(p.publie_at).getTime()) / 86_400_000;
  return jours >= JOURS_VIRAL && p.vues > SEUIL_VIRAL;
}

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-72";

/** Les grands nombres se lisent mal en entier sur une ligne de tableau. */
function abrege(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Total({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

type TriCreateur = "vues" | "elo" | "likes";

export function AdminAnalyticsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [compteId, setCompteId] = React.useState("");
  const [tri, setTri] = React.useState<TriCreateur>("vues");

  const comptes = useQuery({ queryKey: ["stats-comptes"], queryFn: statsComptes });
  const posts = useQuery({
    queryKey: ["stats-posts", compteId || "tous"],
    queryFn: () => statsPosts(compteId || undefined),
  });
  // Tous les posts (sans filtre de compte) pour repérer les viraux J+7 · +30k.
  const tousPosts = useQuery({ queryKey: ["stats-posts-viraux"], queryFn: () => statsPosts() });
  const viraux = (tousPosts.data ?? []).filter(estViral);

  // Va chercher les vraies stats sur le profil TikTok de chaque compte (scrape
  // Apify des 30 derniers posts, rapproché par l'ID du lien publié), puis
  // rafraîchit le tableau. C'est une opération facturée (Apify) : bouton manuel,
  // pas d'appel automatique au chargement de la page.
  const rafraichir = useMutation({
    mutationFn: () => lancerMetriques(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stats-comptes"] });
      queryClient.invalidateQueries({ queryKey: ["stats-posts"] });
      queryClient.invalidateQueries({ queryKey: ["stats-posts-viraux"] });
    },
  });

  const cumul = (comptes.data ?? []).reduce(
    (acc, c) => ({
      vues: acc.vues + Number(c.vues_totales),
      likes: acc.likes + Number(c.likes_totaux),
      publies: acc.publies + Number(c.posts_publies),
      attente: acc.attente + Number(c.posts_en_attente),
    }),
    { vues: 0, likes: 0, publies: 0, attente: 0 },
  );

  const comptesTries = React.useMemo(() => {
    const liste = [...(comptes.data ?? [])];
    liste.sort((a, b) => {
      if (tri === "elo") return Number(b.elo ?? 0) - Number(a.elo ?? 0);
      if (tri === "likes") return Number(b.likes_totaux) - Number(a.likes_totaux);
      return Number(b.vues_totales) - Number(a.vues_totales);
    });
    return liste;
  }, [comptes.data, tri]);

  const mesures = (posts.data ?? []).filter((p) => p.vues !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("analytics.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={rafraichir.isPending}
            onClick={() => rafraichir.mutate()}
          >
            <RefreshCw className={cn("size-4", rafraichir.isPending && "animate-spin")} />
            {rafraichir.isPending ? t("analytics.rafraichirEnCours") : t("analytics.rafraichir")}
          </Button>
          {rafraichir.isSuccess && (
            <p className="text-xs text-success">
              {t("analytics.rafraichiOk", {
                count: (rafraichir.data?.resultats ?? []).reduce((n, r) => n + r.releves, 0),
              })}
            </p>
          )}
          {rafraichir.isError && (
            <p className="text-xs text-destructive">{(rafraichir.error as Error).message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Total label={t("analytics.vues")} valeur={abrege(cumul.vues)} />
        <Total label={t("analytics.likes")} valeur={abrege(cumul.likes)} />
        <Total label={t("analytics.publies")} valeur={String(cumul.publies)} />
        <Total label={t("analytics.enAttente")} valeur={String(cumul.attente)} />
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-4">
          <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums text-orange-600">
            <Flame className="size-5" />
            {viraux.length}
          </p>
          <p className="text-sm text-muted-foreground">{t("analytics.viraux")}</p>
        </div>
      </div>

      <Card className="border-orange-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="size-4 text-orange-500" />
            {t("analytics.virauxTitre")}
          </CardTitle>
          <CardDescription>{t("analytics.virauxDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tousPosts.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {tousPosts.data && viraux.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("analytics.virauxVide")}</p>
          )}
          {viraux.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.sujet_titre ?? t("posts.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    p.persona_nom ?? p.handle_tiktok,
                    p.publie_at ? new Date(p.publie_at).toLocaleDateString(i18n.language) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">👁 {abrege(p.vues)}</span>
              {p.publie_url && (
                <a
                  href={p.publie_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4"
                >
                  {t("analytics.voirTikTok")}
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{t("analytics.parCompte")}</CardTitle>
              <CardDescription>{t("analytics.parCompteDesc")}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("analytics.trierPar")}>
              {(
                [
                  ["vues", t("analytics.vues")],
                  ["elo", t("analytics.elo")],
                  ["likes", t("analytics.likes")],
                ] as const
              ).map(([cle, label]) => (
                <Button
                  key={cle}
                  type="button"
                  size="sm"
                  variant={tri === cle ? "default" : "outline"}
                  onClick={() => setTri(cle)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {comptes.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {comptesTries.length === 0 && !comptes.isPending && (
            <EmptyState title={t("analytics.aucunCompte")} />
          )}

          {comptesTries.map((c, rang) => (
            <Link
              key={c.compte_id}
              to={`/admin/createurs/${c.compte_id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {rang + 1}.
                  </span>
                  <span className="text-sm font-medium">
                    {c.persona_nom ?? c.handle_tiktok ?? "—"}
                  </span>
                  {!c.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
                  <Badge variant="outline">{c.langue.toUpperCase()}</Badge>
                  {/* Un « 0 vue » avec des publiés sans lien n'est pas un bug :
                      le relevé matche par le lien TikTok, qui manque ici. */}
                  {Number(c.posts_sans_lien) > 0 && (
                    <Badge variant="warning" className="gap-1">
                      <LinkIcon className="size-3" />
                      {t("analytics.sansLien", { count: Number(c.posts_sans_lien) })}
                    </Badge>
                  )}
                </div>
                <p className="pl-8 text-xs text-muted-foreground">
                  {[c.poster_prenom, c.poster_nom].filter(Boolean).join(" ") || "—"}
                </p>
              </div>

              <div className="flex items-center gap-4 text-sm tabular-nums">
                <span
                  title={t("analytics.vues")}
                  className={tri === "vues" ? "font-semibold" : undefined}
                >
                  👁 {abrege(Number(c.vues_totales))}
                </span>
                <span
                  title={t("analytics.elo")}
                  className={tri === "elo" ? "font-semibold" : undefined}
                >
                  ELO {c.elo != null ? Number(c.elo).toFixed(1) : "—"}
                </span>
                <span
                  title={t("analytics.likes")}
                  className={tri === "likes" ? "font-semibold" : undefined}
                >
                  ♥ {abrege(Number(c.likes_totaux))}
                </span>
                <span className="text-muted-foreground">
                  {c.posts_publies}/{c.posts_total}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4" />
                {t("analytics.meilleursPosts")}
              </CardTitle>
              <CardDescription>{t("analytics.meilleursPostsDesc")}</CardDescription>
            </div>
            <select
              aria-label={t("analytics.parCompte")}
              className={selectClass}
              value={compteId}
              onChange={(e) => setCompteId(e.target.value)}
            >
              <option value="">{t("analytics.tousComptes")}</option>
              {comptesTries.map((c) => (
                <option key={c.compte_id} value={c.compte_id}>
                  {c.persona_nom ?? c.handle_tiktok ?? c.compte_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {posts.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}

          {mesures.length === 0 && !posts.isPending && (
            <EmptyState
              title={t("analytics.aucuneMesure")}
              description={t("analytics.aucuneMesureAide")}
            />
          )}

          {mesures.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {estViral(p) && <Flame className="size-3.5 shrink-0 text-orange-500" />}
                  {p.sujet_titre ?? t("posts.title")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    p.persona_nom ?? p.handle_tiktok,
                    t(`type.${p.type}`),
                    p.publie_at
                      ? new Date(p.publie_at).toLocaleDateString(i18n.language)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="flex gap-4 text-sm tabular-nums">
                <span>👁 {abrege(p.vues)}</span>
                <span>♥ {abrege(p.likes)}</span>
                <span>💬 {abrege(p.commentaires)}</span>
              </div>

              {p.publie_url && (
                <a
                  href={p.publie_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4"
                >
                  {t("analytics.voirTikTok")}
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
