import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CarteRecrutement } from "@/features/ckd/CarteRecrutement";
import { listerControles } from "@/features/ckd/api";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import { CLE_CIBLES, listerCiblesRecrutement } from "./api";
import { recrutesParPays } from "./logique";

/**
 * Prompt 21, D : côté admin, la carte « À recruter » du dernier contrôle du
 * samedi (la cible par pays, enregistrée pour la cohorte du lundi J+9), avec
 * les recrutés et l'écart de chaque pays.
 */
export function CiblesRecrutementAdmin() {
  const { t } = useTranslation();
  const controles = useQuery({ queryKey: ["ckd", "controles"], queryFn: listerControles });
  const samedi = (controles.data ?? []).find((c) => c.type === "samedi");
  const cohorte = samedi ? ajouterJours(samedi.jour, 9) : null;
  const cibles = useQuery({
    queryKey: [...CLE_CIBLES, "admin", cohorte],
    queryFn: () => listerCiblesRecrutement(cohorte!),
    enabled: Boolean(cohorte),
  });
  if (controles.isPending) return null;
  if (!samedi) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recrutementCibles.titre")}</CardTitle>
          <CardDescription>{t("recrutementCibles.aucunControle")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <CarteRecrutement controle={samedi} recrutes={cibles.data ? recrutesParPays(cibles.data, cohorte!) : undefined} />;
}
