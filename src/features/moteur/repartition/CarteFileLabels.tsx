import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ecrireReglage,
  lireReglages,
  listerLabelIdsAvecUgc,
  listerLabels,
} from "../api";
import type { Reglages } from "../types";
import { avecItemsApplication } from "./fileApplication";
import {
  FileLabelsApplicationEditeur,
  type ChangementFileLabels,
} from "./FileLabelsApplicationEditeur";

/**
 * La File des créateurs, sur la page Allocation.
 *
 * ELLE PASSE AVANT LE MOTEUR, des deux côtés : à la création d'un compte,
 * `manage-users` tire d'abord le label de la File de l'application, et c'est
 * seulement si elle est vide qu'il classe. Depuis la bascule, la File attire
 * même l'APPLICATION : si une entrée utilisable existe pour ce marché, c'est
 * cette application-là qui prend le compte, quel que soit le classement.
 *
 * À QUOI ÇA SERT, concrètement. Un label neuf n'a pas d'historique, donc le
 * moteur ne le choisira jamais de lui-même, donc il n'aura jamais
 * d'historique. La File est la sortie de cette boucle : on y met le label pour
 * l'amorcer sur deux ou trois comptes, le temps qu'il ait des chiffres.
 *
 * C'est pour ça qu'elle vit ICI et plus dans Réglages : décider où va la
 * prochaine recrue et forcer la main au moteur sont la même conversation.
 *
 * SAUVEGARDE IMMÉDIATE, SUR UNE VALEUR RELUE. Chaque modification est écrite
 * aussitôt, après relecture en base, jamais sur l'instantané de la page : une
 * embauche a pu tirer une entrée depuis qu'on a ouvert l'écran, et réécrire
 * le brouillon la ressusciterait.
 */
export function CarteFileLabels() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sauveAt, setSauveAt] = React.useState<number | null>(null);

  const reglages = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });
  const labels = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
    staleTime: 30_000,
  });
  const labelsUgc = useQuery({
    queryKey: ["labels-avec-ugc"],
    queryFn: () => listerLabelIdsAvecUgc(),
    staleTime: 30_000,
  });

  const persister = useMutation({
    mutationFn: async (chg: ChangementFileLabels) => {
      const frais = (await lireReglages()).file_labels_comptes;
      const file = avecItemsApplication(frais, chg.slug, chg.cle, chg.items);
      await ecrireReglage("file_labels_comptes", file);
      return file;
    },
    onSuccess: (file) => {
      setSauveAt(Date.now());
      queryClient.setQueryData<Reglages>(["reglages"], (old) =>
        old ? { ...old, file_labels_comptes: file } : old,
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.fileTitre")}</CardTitle>
        <CardDescription>{t("repartition.fileAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("warmup.fileAutosave")}
          {persister.isPending
            ? ` — ${t("common.saving")}`
            : sauveAt
              ? ` — ${t("warmup.fileSauvee")}`
              : ""}
        </p>
        {reglages.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : reglages.data ? (
          <FileLabelsApplicationEditeur
            file={reglages.data.file_labels_comptes}
            onChange={(_file, changement) => persister.mutate(changement)}
            enCours={persister.isPending}
            labels={labels.data}
            labelsUgc={labelsUgc.data}
          />
        ) : null}
        {persister.isError && (
          <p className="text-xs text-destructive">{(persister.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
