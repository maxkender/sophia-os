import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";

import { compterVersionsFiches, enregistrerFicheAppli, listerFichesAppli, type FicheAppli } from "./api";
import { modeleFicheAppli } from "./logique";
import { messageErreur } from "./messageErreur";

const CLE_REQUETE_FICHES = ["fiches-appli"] as const;
const CLE_REQUETE_VERSIONS = ["fiches-appli-versions"] as const;

/** Une fiche par application : la vérité produit (lue par les agents) et sa présentation aux relecteurs. */
export function SectionFichesAppli() {
  const { t } = useTranslation();
  const { applications } = useApplication();
  const fiches = useQuery({ queryKey: CLE_REQUETE_FICHES, queryFn: listerFichesAppli });
  const versions = useQuery({ queryKey: CLE_REQUETE_VERSIONS, queryFn: compterVersionsFiches });

  if (fiches.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(fiches.error)}
      </p>
    );
  }
  if (fiches.isPending || applications.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("relectureNative.fiches.aide")}</p>
      {applications.map((app) => (
        <CarteFicheAppli
          key={app.id}
          applicationId={app.id}
          nom={nomApplication(app)}
          fiche={fiches.data?.find((f) => f.application_id === app.id) ?? null}
          versions={versions.data?.[app.id] ?? 0}
        />
      ))}
    </div>
  );
}

function CarteFicheAppli({
  applicationId,
  nom,
  fiche,
  versions,
}: {
  applicationId: string;
  nom: string;
  fiche: FicheAppli | null;
  versions: number;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [contenu, setContenu] = React.useState(fiche?.contenu ?? "");
  const [presentation, setPresentation] = React.useState(fiche?.presentation_relecteur ?? "");

  // La fiche enregistrée change (rechargement après enregistrement) : on repart d'elle.
  React.useEffect(() => {
    setContenu(fiche?.contenu ?? "");
    setPresentation(fiche?.presentation_relecteur ?? "");
  }, [fiche?.contenu, fiche?.presentation_relecteur]);

  const modifie = contenu !== (fiche?.contenu ?? "") || presentation !== (fiche?.presentation_relecteur ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerFicheAppli(applicationId, contenu, presentation),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_FICHES });
      void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_VERSIONS });
    },
  });

  return (
    <Card data-testid={`fiche-appli-${applicationId}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {t("relectureNative.fiches.titre", { nom })}
          {!fiche?.contenu?.trim() && <Badge variant="warning">{t("relectureNative.fiches.vide")}</Badge>}
        </CardTitle>
        <CardDescription>
          {fiche?.updated_at
            ? t("relectureNative.fiches.majLe", {
                date: new Date(fiche.updated_at).toLocaleString(i18n.language),
                versions,
              })
            : t("relectureNative.fiches.jamais")}
        </CardDescription>
      </CardHeader>
      <CardPanel className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium">{t("relectureNative.fiches.contenu")}</span>
            {!contenu.trim() && (
              <Button type="button" variant="outline" size="sm" onClick={() => setContenu(modeleFicheAppli(nom))}>
                {t("relectureNative.fiches.partirDuModele")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("relectureNative.fiches.contenuAide")}</p>
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={16}
            className="font-mono text-xs"
            aria-label={t("relectureNative.fiches.contenu")}
          />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium">{t("relectureNative.fiches.presentation")}</span>
          <span className="block text-xs text-muted-foreground">{t("relectureNative.fiches.presentationAide", { nom })}</span>
          <Textarea
            value={presentation}
            onChange={(e) => setPresentation(e.target.value)}
            rows={4}
            aria-label={t("relectureNative.fiches.presentation")}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            {t("relectureNative.fiches.enregistrer")}
          </Button>
          {modifie && <span className="text-xs text-muted-foreground">{t("relectureNative.fiches.nonEnregistre")}</span>}
          {enregistrer.isSuccess && !modifie && (
            <span className="text-xs text-muted-foreground">{t("relectureNative.fiches.enregistre")}</span>
          )}
        </div>
        {enregistrer.error && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(enregistrer.error)}
          </p>
        )}
      </CardPanel>
    </Card>
  );
}
