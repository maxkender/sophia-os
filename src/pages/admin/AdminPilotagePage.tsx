import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  creerLabel,
  ecrireReglage,
  lireReglages,
  listerLabels,
  supprimerLabel,
} from "@/features/moteur/api";

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
  const { t } = useTranslation();

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
    </div>
  );
}
