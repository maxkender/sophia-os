import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DoorClosed, DoorOpen, Power } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { ecrireEspaceOuvert, lireReglageRelecture } from "./api";
import { messageErreur } from "./messageErreur";
import { Puce, TuileIcone } from "./Puces";

export const CLE_REQUETE_REGLAGE = ["relecture-native-reglage"] as const;

/**
 * Les deux interrupteurs. L'espace relecteur s'ouvre ici ; la production reste
 * coupée tant que les agents de langue ne sont pas branchés.
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
    <Card className="divide-y overflow-hidden">
      <Ligne
        icone={<TuileIcone icone={ouvert ? DoorOpen : DoorClosed} ton={ouvert ? "vert" : "neutre"} />}
        titre={t("relectureNative.interrupteurs.espace")}
        texte={ouvert ? t("relectureNative.interrupteurs.espaceOuvert") : t("relectureNative.interrupteurs.espaceFerme")}
        droite={
          <>
            <Puce ton={ouvert ? "vert" : "neutre"}>
              {ouvert ? t("relectureNative.interrupteurs.ouvert") : t("relectureNative.interrupteurs.ferme")}
            </Puce>
            <Switch
              checked={ouvert}
              disabled={reglage.isPending || basculer.isPending}
              onCheckedChange={(v) => basculer.mutate(v === true)}
              aria-label={t("relectureNative.interrupteurs.espace")}
            />
          </>
        }
      />
      <Ligne
        icone={<TuileIcone icone={Power} />}
        titre={t("relectureNative.interrupteurs.production")}
        texte={t("relectureNative.interrupteurs.productionAide")}
        droite={<Puce>{t("relectureNative.interrupteurs.coupee")}</Puce>}
      />
      {(reglage.error ?? basculer.error) && (
        <p role="alert" className="px-5 py-3 text-xs text-destructive">
          {messageErreur(reglage.error ?? basculer.error)}
        </p>
      )}
    </Card>
  );
}

function Ligne({
  icone,
  titre,
  texte,
  droite,
}: {
  icone: React.ReactNode;
  titre: string;
  texte: string;
  droite: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      {icone}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{titre}</p>
        <p className="text-xs text-muted-foreground">{texte}</p>
      </div>
      <div className="flex items-center gap-3">{droite}</div>
    </div>
  );
}
