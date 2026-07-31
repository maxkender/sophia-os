import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

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
import {
  aujourdhui,
  mediasPostsPrevusJour,
  postsCalendrierAdmin,
  upscaleMedia,
  type ModeleUpscale,
  type PostCalendrierAdmin,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import { AGENTS_UPSCALE, AGENTS_UPSCALE_SEEDVR, executerEnLot } from "@/lib/lot";
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

export function AdminCalendrierPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [date, setDate] = React.useState(aujourdhui);
  const [filtreLangue, setFiltreLangue] = React.useState("");
  const [modeleUpscale, setModeleUpscale] = React.useState<ModeleUpscale>("realesrgan");
  const [upscaleLot, setUpscaleLot] = React.useState<{ fait: number; total: number } | null>(
    null,
  );
  const [upscaleLogs, setUpscaleLogs] = React.useState<string[]>([]);

  const { data: posts, isPending } = useQuery({
    queryKey: ["posts-calendrier-admin"],
    queryFn: postsCalendrierAdmin,
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
        score: postsCompte[0]?.score ?? null,
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
  const lotEnCours = upscaleLot !== null;

  async function upscalePostsDuJour() {
    if (lotEnCours || duJour.length === 0) return;

    const postIdsFiltre = new Set(duJour.map((p) => p.id));
    const tous = await mediasPostsPrevusJour(date);
    // Respecte le filtre langue affiché (posts du jour visibles).
    const medias = tous.filter((m) => postIdsFiltre.has(m.postId));
    const aFaire = medias.filter((m) => !m.upscale_le);
    const deja = medias.length - aFaire.length;

    const labelModele =
      modeleUpscale === "seedvr"
        ? t("bibliotheque.upscaleSeedvr")
        : t("bibliotheque.upscaleRealesrgan");

    if (aFaire.length === 0) {
      setUpscaleLogs([
        t("adminCal.upscaleRien", { total: medias.length, deja }),
      ]);
      return;
    }

    if (
      !window.confirm(
        t("adminCal.upscaleConfirm", {
          count: aFaire.length,
          modele: labelModele,
          deja,
        }),
      )
    ) {
      return;
    }

    setUpscaleLot({ fait: 0, total: aFaire.length });
    setUpscaleLogs([
      t("adminCal.upscaleDebut", {
        count: aFaire.length,
        modele: labelModele,
        posts: duJour.length,
        deja,
      }),
    ]);

    let ok = 0;
    let sautes = 0;
    let echecs = 0;

    await executerEnLot(
      aFaire,
      async (media) => {
        try {
          const r = await upscaleMedia(media.mediaId, { modele: modeleUpscale });
          if (r.saute) {
            sautes += 1;
            setUpscaleLogs((prev) => [
              ...prev,
              `· ${media.mediaId.slice(0, 8)} — ${r.detail ?? "déjà upscalée"}`,
            ]);
          } else if (r.ok) {
            ok += 1;
            setUpscaleLogs((prev) => [
              ...prev,
              `✓ ${media.mediaId.slice(0, 8)} — ${r.detail ?? "ok"}`,
            ]);
          } else {
            echecs += 1;
            setUpscaleLogs((prev) => [
              ...prev,
              `✗ ${media.mediaId.slice(0, 8)} — ${r.error ?? "échec"}`,
            ]);
          }
        } catch (e) {
          echecs += 1;
          setUpscaleLogs((prev) => [
            ...prev,
            `✗ ${media.mediaId.slice(0, 8)} — ${(e as Error).message}`,
          ]);
        }
      },
      {
        largeur: modeleUpscale === "seedvr" ? AGENTS_UPSCALE_SEEDVR : AGENTS_UPSCALE,
        onProgres: (fait, total) => setUpscaleLot({ fait, total }),
      },
    );

    setUpscaleLogs((prev) => [
      ...prev,
      t("bibliotheque.upscaleFin", { ok, sautes, echecs }),
    ]);
    setUpscaleLot(null);
    void queryClient.invalidateQueries({ queryKey: ["posts-calendrier-admin"] });
    void queryClient.invalidateQueries({ queryKey: ["slides"] });
    void queryClient.invalidateQueries({ queryKey: ["medias"] });
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
  }

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

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="sr-only">{t("bibliotheque.upscaleModele")}</span>
            <select
              value={modeleUpscale}
              disabled={lotEnCours}
              onChange={(e) =>
                setModeleUpscale(e.target.value === "seedvr" ? "seedvr" : "realesrgan")
              }
              title={
                modeleUpscale === "seedvr"
                  ? t("bibliotheque.upscaleAideSeedvr")
                  : t("bibliotheque.upscaleAideRealesrgan")
              }
              className="flex h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="realesrgan">{t("bibliotheque.upscaleRealesrgan")}</option>
              <option value="seedvr">{t("bibliotheque.upscaleSeedvr")}</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={lotEnCours || prevus === 0}
              onClick={() => void upscalePostsDuJour()}
              title={t("adminCal.upscaleAide")}
            >
              <Maximize2 className="size-4" />
              {upscaleLot
                ? t("adminCal.upscaleLot", {
                    fait: upscaleLot.fait,
                    total: upscaleLot.total,
                  })
                : t("adminCal.upscaleTout")}
            </Button>
          </div>

          {upscaleLogs.length > 0 && (
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
              {upscaleLogs.join("\n")}
            </pre>
          )}
        </CardContent>
      </Card>

      {isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {!isPending && parCreateur.length === 0 && <EmptyState title={t("adminCal.videJour")} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {parCreateur.map((groupe) => {
          const complet = groupe.postes === groupe.posts.length;
          return (
            <Link
              key={groupe.compteId}
              to={`/admin/createurs/${groupe.compteId}?date=${date}`}
              className={cn(
                "group flex flex-col gap-3 rounded-xl border bg-card p-3 transition-colors",
                "hover:border-foreground/20 hover:bg-muted/40",
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="size-11 shrink-0 overflow-hidden rounded-full bg-muted">
                  {groupe.avatar ? (
                    <img src={groupe.avatar} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight group-hover:underline">
                    {groupe.nom}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {groupe.handle ? `@${groupe.handle}` : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <Badge variant={complet ? "success" : "warning"}>
                  {t("adminCal.faitSur", { faits: groupe.postes, total: groupe.posts.length })}
                </Badge>
                {groupe.score != null && (
                  <Badge variant="secondary">
                    {t("adminCal.eloCourt", { score: Number(groupe.score).toFixed(0) })}
                  </Badge>
                )}
                {groupe.langue && (
                  <Badge variant="outline">{groupe.langue.toUpperCase()}</Badge>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
