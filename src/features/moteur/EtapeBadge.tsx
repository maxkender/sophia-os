import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import type { Etape, EtatEtape, Qualite } from "./etapes";

const VARIANTE_ETAPE: Record<Etape, "outline" | "warning" | "info" | "success" | "secondary" | "error"> = {
  not_created: "outline",
  not_warming_up: "warning",
  warming_up: "info",
  ready: "info",
  posting: "success",
  dormant: "secondary",
  stopped: "secondary",
};

/** Le tag d'étape : les mêmes mots sur Posters, le dashboard HM et Cohort tracking. */
export function EtapeBadge({ etat }: { etat: EtatEtape }) {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANTE_ETAPE[etat.etape]} data-etape={etat.etape}>
      {etat.etape === "posting" && etat.semaine
        ? t("etapes.postingSemaine", { n: etat.semaine })
        : t(`etapes.${etat.etape}`)}
    </Badge>
  );
}

const VARIANTE_QUALITE: Record<Qualite, "success" | "warning" | "error"> = {
  good: "success",
  poor_views: "warning",
  shadowban: "error",
};

/** Le tag de qualité, séparé : GOOD / POOR VIEWS / SHADOWBAN. */
export function QualiteBadge({ qualite }: { qualite: Qualite | null | undefined }) {
  const { t } = useTranslation();
  if (!qualite) return null;
  return (
    <Badge variant={VARIANTE_QUALITE[qualite]} data-qualite={qualite}>
      {t(`etapes.qualite.${qualite}`)}
    </Badge>
  );
}
