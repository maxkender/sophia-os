import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarreChargement } from "@/components/ui/progress";
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
  lancerAssignationJour,
  lireReglages,
  suiviAssignation,
  type SuiviMinuit,
} from "@/features/moteur/api";

function badgePipeline(statut: string) {
  if (statut === "done") return "success" as const;
  if (statut === "failed") return "destructive" as const;
  if (statut === "running") return "warning" as const;
  return "secondary" as const;
}

/** Un compte et ce que minuit lui a (ou non) fabriqué ce jour-là. */
function LigneCompte({
  ligne,
  date,
  onAssigne,
  assignationEnCours,
}: {
  ligne: SuiviMinuit;
  date: string;
  onAssigne: () => void;
  assignationEnCours: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const faits = ligne.posts.length;
  const manque = Math.max(0, ligne.quota - faits);
  const echec = ligne.posts.some((p) => p.pipeline_statut === "failed");

  const assignerUn = useMutation({
    mutationFn: () => lancerAssignationJour(date, ligne.compteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suivi-minuit", date] });
      onAssigne();
    },
  });

  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
            {ligne.avatar_url ? (
              <img src={ligne.avatar_url} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{ligne.nom}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ligne.handle ? `@${ligne.handle}` : "—"} · {ligne.langue.toUpperCase()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={manque > 0 || echec ? "warning" : "success"}>
            {t("minuit.faitSur", { faits, quota: ligne.quota })}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            disabled={assignationEnCours || assignerUn.isPending}
            onClick={() => assignerUn.mutate()}
            title={t("minuit.assignerUnAide")}
          >
            {assignerUn.isPending ? t("minuit.enCours") : t("minuit.assignerUn")}
          </Button>
        </div>
      </div>
      {assignerUn.isError && (
        <p className="text-xs text-destructive">{(assignerUn.error as Error).message}</p>
      )}
      {assignerUn.isSuccess && (
        <p className="text-xs text-success">
          {t("minuit.lance", {
            crees: assignerUn.data.resultats.reduce((n, r) => n + r.crees, 0),
          })}
        </p>
      )}

      {manque > 0 && !echec && (
        <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
          {t("minuit.manquant", { count: manque })}
        </p>
      )}

      {ligne.posts.map((p) => {
        const aUnPost = Boolean(p.passage_id && p.id !== p.passage_id) || !p.passage_id;
        return (
          <div
            key={p.passage_id ?? p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{t(`type.${p.type}`)}</Badge>
              <Badge variant={badgePipeline(p.pipeline_statut)}>
                {t(`statut.${p.pipeline_statut}`)}
              </Badge>
              {p.pipeline_etape && p.pipeline_statut === "running" && (
                <span className="text-xs text-muted-foreground">{p.pipeline_etape}</span>
              )}
            </div>
            {aUnPost && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/admin/posts/${p.id}`}>{t("posts.ouvrir")}</Link>
              </Button>
            )}
            {p.pipeline_erreur && (
              <p className="w-full rounded bg-destructive/10 p-2 text-xs text-destructive">
                {p.pipeline_erreur}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Un compteur en tête de page (comptes / prêts / en cours / échoués). */
function Tuile({
  icon: Icon,
  valeur,
  label,
  ton,
}: {
  icon: React.ComponentType<{ className?: string }>;
  valeur: number;
  label: string;
  ton: "neutre" | "ok" | "attente" | "echec";
}) {
  const couleur = {
    neutre: "text-foreground",
    ok: "text-success",
    attente: "text-warning",
    echec: "text-destructive",
  }[ton];
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className={`size-5 ${couleur}`} />
      <div>
        <p className={`text-xl font-semibold ${couleur}`}>{valeur}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function AdminMinuitPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [date, setDate] = React.useState(aujourdhui());

  const suivi = useQuery({
    queryKey: ["suivi-minuit", date],
    queryFn: () => suiviAssignation(date),
    // Rafraîchit tant qu'un post est en cours de fabrication, pour suivre en direct.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((l) =>
        l.posts.some((p) => p.pipeline_statut === "running" || p.pipeline_statut === "pending"),
      )
        ? 4000
        : false,
  });

  const reglages = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });
  const autoEnPause = reglages.data?.assignation_auto.actif === false;

  const relancer = useMutation({
    mutationFn: () => lancerAssignationJour(date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suivi-minuit", date] }),
  });

  const lignes = suivi.data ?? [];
  const posts = lignes.flatMap((l) => l.posts);
  const prets = posts.filter((p) => p.pipeline_statut === "done").length;
  const enCours = posts.filter(
    (p) => p.pipeline_statut === "running" || p.pipeline_statut === "pending",
  ).length;
  const echoues = posts.filter((p) => p.pipeline_statut === "failed").length;
  const comptesEnEchec = lignes.filter(
    (l) => l.posts.some((p) => p.pipeline_statut === "failed") || l.posts.length < l.quota,
  ).length;

  // Résumé du dernier lancement manuel (par compte, avec les erreurs d'assignation
  // — celles qui empêchent MÊME de créer le post, distinctes des erreurs pipeline).
  const erreursAssignation = (relancer.data?.resultats ?? []).filter((r) => r.erreur);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("minuit.titre")}</CardTitle>
          <CardDescription>{t("minuit.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {autoEnPause && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              {t("minuit.pauseBanner")}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("minuit.jour")}</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => suivi.refetch()}
              disabled={suivi.isFetching}
            >
              <RefreshCw className={`mr-2 size-4 ${suivi.isFetching ? "animate-spin" : ""}`} />
              {t("common.refresh")}
            </Button>
            <Button onClick={() => relancer.mutate()} disabled={relancer.isPending}>
              {relancer.isPending ? t("minuit.enCours") : t("minuit.relancer")}
            </Button>
          </div>

          <BarreChargement
            actif={relancer.isPending}
            dureeMs={9_000}
            label={t("minuit.enCours")}
          />


          {relancer.isSuccess && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {t("minuit.lance", {
                crees: relancer.data.resultats.reduce((n, r) => n + r.crees, 0),
              })}
            </div>
          )}
          {relancer.isError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {(relancer.error as Error).message}
            </div>
          )}
          {erreursAssignation.length > 0 && (
            <div className="space-y-1 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-medium">{t("minuit.erreursAssignation")}</p>
              {erreursAssignation.map((r) => (
                <p key={r.compteId}>
                  {lignes.find((l) => l.compteId === r.compteId)?.nom ?? r.compteId.slice(0, 8)} —{" "}
                  {r.erreur}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tuile icon={CheckCircle2} valeur={prets} label={t("minuit.prets")} ton="ok" />
            <Tuile icon={Clock} valeur={enCours} label={t("minuit.enCoursLabel")} ton="attente" />
            <Tuile icon={AlertTriangle} valeur={echoues} label={t("minuit.echoues")} ton="echec" />
            <Tuile
              icon={AlertTriangle}
              valeur={comptesEnEchec}
              label={t("minuit.comptesIncomplets")}
              ton={comptesEnEchec > 0 ? "echec" : "neutre"}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("minuit.parCompte")}</CardTitle>
          <CardDescription>{t("minuit.parCompteDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {suivi.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {suivi.data?.length === 0 && <EmptyState title={t("minuit.aucunCompte")} />}
          {lignes.map((ligne) => (
            <LigneCompte
              key={ligne.compteId}
              ligne={ligne}
              date={date}
              assignationEnCours={relancer.isPending}
              onAssigne={() =>
                void queryClient.invalidateQueries({ queryKey: ["suivi-minuit", date] })
              }
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
