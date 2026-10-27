import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { ecrireEspaceOuvert, lireReglageRelecture } from "./api";
import { messageErreur } from "./messageErreur";

export const CLE_REQUETE_REGLAGE = ["relecture-native-reglage"] as const;

/**
 * Les deux interrupteurs. L'espace relecteur s'ouvre ici ; la production reste
 * coupée à l'étape 1 (aucune fonction ne lit encore le système).
 */
export function CarteInterrupteurs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const reglage = useQuery({ queryKey: CLE_REQUETE_REGLAGE, queryFn: lireReglageRelecture });
  const basculer = useMutation({
    mutationFn: (ouvert: boolean) => ecrireEspaceOuvert(ouvert),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_REGLAGE }),
  });
  const ouvert = reglage.data?.espace_ouvert === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("relectureNative.interrupteurs.titre")}</CardTitle>
        <CardDescription>{t("relectureNative.interrupteurs.description")}</CardDescription>
      </CardHeader>
      <CardPanel className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("relectureNative.interrupteurs.espace")}</p>
            <p className="text-xs text-muted-foreground">
              {ouvert ? t("relectureNative.interrupteurs.espaceOuvert") : t("relectureNative.interrupteurs.espaceFerme")}
            </p>
          </div>
          <Switch
            checked={ouvert}
            disabled={reglage.isPending || basculer.isPending}
            onCheckedChange={(v) => basculer.mutate(v === true)}
            aria-label={t("relectureNative.interrupteurs.espace")}
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("relectureNative.interrupteurs.production")}</p>
            <p className="text-xs text-muted-foreground">{t("relectureNative.interrupteurs.productionAide")}</p>
          </div>
          <Badge variant="secondary">{t("relectureNative.interrupteurs.coupee")}</Badge>
        </div>
        {(reglage.error ?? basculer.error) && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(reglage.error ?? basculer.error)}
          </p>
        )}
      </CardPanel>
    </Card>
  );
}
