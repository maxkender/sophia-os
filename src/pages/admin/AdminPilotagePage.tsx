import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Images } from "lucide-react";

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
import { supabase } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apercuSujet,
  creerLabel,
  ecrireReglage,
  lireReglages,
  listerLabels,
  listerSujets,
  supprimerLabel,
} from "@/features/moteur/api";
import type { Sujet } from "@/features/moteur/types";

/**
 * Le slideshow STOCKÉ d'un sujet, dans l'ordre : chaque slide = image nettoyée
 * (celle que le poster reçoit) + son texte d'origine, prêt à re-traduire. On peut
 * basculer sur l'image d'origine (avec le texte incrusté) pour comparer.
 */
function DiaporamaStocke({ sujetId }: { sujetId: string }) {
  const { t } = useTranslation();
  const [avecTexte, setAvecTexte] = React.useState(false);
  const slides = useQuery({
    queryKey: ["apercu-sujet", sujetId],
    queryFn: () => apercuSujet(sujetId),
  });

  if (slides.isPending) {
    return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{t("sujets.diaporamaStocke")}</p>
        <button
          type="button"
          onClick={() => setAvecTexte((v) => !v)}
          className="text-xs text-primary underline underline-offset-2"
        >
          {avecTexte ? t("sujets.voirNettoyees") : t("sujets.voirOriginales")}
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {slides.data?.map((s) => {
          const url = avecTexte ? s.url_brute ?? s.url_propre : s.url_propre ?? s.url_brute;
          return (
            <div key={s.position} className="w-32 shrink-0 space-y-1">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                {url ? (
                  <img src={url} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    {t("sujets.enAttente")}
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs font-medium text-white">
                  {s.position}
                </span>
              </div>
              <p className="line-clamp-3 text-[11px] text-muted-foreground">
                {s.texte_original || t("sujets.sansTexte")}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("sujets.diaporamaAide")}</p>
    </div>
  );
}

async function compter(table: string): Promise<number> {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

function Compteur({ label, valeur }: { label: string; valeur: number | undefined }) {
  return (
    <div className="border border-border/80 bg-card/80 px-4 py-3">
      <p className="font-display text-2xl font-semibold tabular-nums tracking-tight">
        {valeur ?? "—"}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function badgeStatut(statut: string) {
  if (statut === "retenu" || statut === "done") return "success";
  if (statut === "rejete" || statut === "failed") return "destructive";
  if (statut === "running") return "warning";
  return "secondary";
}


function LabelsPilotageCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const [nom, setNom] = React.useState("");
  const [couleur, setCouleur] = React.useState("#2f6f4e");

  const creer = useMutation({
    mutationFn: () => creerLabel(nom.trim(), couleur),
    onSuccess: () => {
      setNom("");
      qc.invalidateQueries({ queryKey: ["labels"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerLabel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
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
          <Button type="submit" disabled={creer.isPending || !nom.trim()}>
            {creer.isPending ? t("common.saving") : t("labels.creer")}
          </Button>
        </form>
        {creer.isError && (
          <p className="text-xs text-destructive">
            {t("labels.erreurCreation")}: {(creer.error as Error).message}
          </p>
        )}
        {supprimer.isError && (
          <p className="text-xs text-destructive">
            {t("labels.erreurSuppression")}: {(supprimer.error as Error).message}
          </p>
        )}

        <div className="list-enter flex flex-wrap gap-2">
          {labels.isPending && (
            <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
          )}
          {labels.isError && (
            <p className="text-xs text-destructive">
              {t("labels.erreurChargement")}: {(labels.error as Error).message}
            </p>
          )}
          {(labels.data ?? []).map((lab) => (
            <div
              key={lab.id}
              className="flex items-center gap-1 border border-border/80 px-2 py-1 text-xs"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: lab.couleur ?? "#888" }}
              />
              <span className="font-medium">{lab.nom}</span>
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
          {!labels.isPending && !labels.isError && (labels.data?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">{t("labels.aucunIci")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PaiementPilotageCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const reglages = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });
  const [base, setBase] = React.useState<number | null>(null);
  const [unitaire, setUnitaire] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (reglages.data) {
      setBase(reglages.data.paiement.tarif_base_mensuel);
      setUnitaire(reglages.data.paiement.tarif_par_post_jour);
    }
  }, [reglages.data]);

  const save = useMutation({
    mutationFn: async () => {
      await ecrireReglage("paiement", {
        tarif_base_mensuel: base ?? 0,
        tarif_par_post_jour: unitaire ?? 0,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reglages"] }),
  });

  if (base === null || unitaire === null) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
      </Card>
    );
  }

  const exemple = (base ?? 0) + 2 * (unitaire ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paiement.title")}</CardTitle>
        <CardDescription>{t("paiement.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tarifBase">{t("paiement.base")}</Label>
            <Input
              id="tarifBase"
              type="number"
              min={0}
              value={base}
              onChange={(e) => setBase(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tarifUnit">{t("paiement.unitaire")}</Label>
            <Input
              id="tarifUnit"
              type="number"
              min={0}
              value={unitaire}
              onChange={(e) => setUnitaire(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("paiement.formule", { exemple })}
        </p>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function AdminPilotagePage() {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = React.useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: async () => ({
      sujets: await compter("sujets"),
      posts: await compter("posts"),
      medias: await compter("media_library"),
      comptes: await compter("comptes"),
      contenus: await compter("contenus"),
      passages: await compter("passages"),
      labels: await compter("labels"),
    }),
  });

  const sujets = useQuery({ queryKey: ["sujets"], queryFn: listerSujets });

  return (
    <div className="space-y-6">
      <div className="list-enter grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Compteur label={t("pilotage.contenus")} valeur={stats.data?.contenus} />
        <Compteur label={t("pilotage.passages")} valeur={stats.data?.passages} />
        <Compteur label={t("pilotage.labels")} valeur={stats.data?.labels} />
        <Compteur label={t("pilotage.sujets")} valeur={stats.data?.sujets} />
        <Compteur label={t("pilotage.posts")} valeur={stats.data?.posts} />
        <Compteur label={t("pilotage.medias")} valeur={stats.data?.medias} />
        <Compteur label={t("pilotage.comptes")} valeur={stats.data?.comptes} />
      </div>

      <LabelsPilotageCard />
      <PaiementPilotageCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("slideshows.title")}</CardTitle>
            <CardDescription>{t("slideshows.subtitle")}</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/slideshows">{t("contenus.ouvrir")}</Link>
          </Button>
        </CardHeader>
      </Card>

      {/* Le moteur tourne tout seul (crons de nuit). Pour tester à la main, tout
          est regroupé sur la page Tests — pas de boutons bruts ici. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pilotage.autoTitre")}</CardTitle>
          <CardDescription>{t("pilotage.autoDesc")}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sujets.title")}</CardTitle>
          <CardDescription>{t("sujets.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sujets.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {sujets.data?.length === 0 && <EmptyState title={t("sujets.empty")} />}

          {sujets.data?.map((sujet: Sujet) => (
            <div key={sujet.id} className="space-y-1.5 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{sujet.titre}</p>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant={badgeStatut(sujet.statut)}>{t(`statut.${sujet.statut}`)}</Badge>
                  <Badge variant={badgeStatut(sujet.preparation_statut)}>
                    {t(`statut.${sujet.preparation_statut}`)}
                  </Badge>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {[
                  t("sujets.slides", { count: sujet.structure_slides?.length ?? 0 }),
                  sujet.pertinence_score !== null
                    ? t("sujets.pertinence", { score: sujet.pertinence_score })
                    : null,
                  new Date(sujet.created_at).toLocaleDateString(i18n.language),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {sujet.pertinence_raison && (
                <p className="text-xs text-muted-foreground">{sujet.pertinence_raison}</p>
              )}
              {sujet.preparation_erreur && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  {sujet.preparation_erreur}
                </p>
              )}

              {/* Seuls les sujets RETENUS/UTILISÉS sont nettoyés (images propres) :
                  les rejetés ne le sont pas (on ne dépense pas de crédit dessus).
                  On ne propose donc l'aperçu « diaporama stocké » que pour ceux-là. */}
              {(sujet.structure_slides?.length ?? 0) > 0 &&
                (sujet.statut === "retenu" || sujet.statut === "utilise") && (
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOuvert((o) => (o === sujet.id ? null : sujet.id))}
                  >
                    <Images className="size-4" />
                    {ouvert === sujet.id ? t("sujets.masquerDiaporama") : t("sujets.voirDiaporama")}
                  </Button>
                  {ouvert === sujet.id && (
                    <div className="pt-3">
                      <DiaporamaStocke sujetId={sujet.id} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
