import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import { localeDate } from "@/locales/localeDate";

import { tempsRestant, type Etape, type EtatEtape, type Qualite } from "./etapes";

const VARIANTE_ETAPE: Record<Etape, "outline" | "warning" | "info" | "success" | "secondary" | "error"> = {
  not_created: "outline",
  not_warming_up: "warning",
  warming_up: "info",
  ready: "info",
  posting: "success",
  inactive: "error",
  dormant: "secondary",
  stopped: "secondary",
};

/** Le tag d'étape : les mêmes mots sur Posters, le dashboard HM et Cohort tracking. */
export function EtapeBadge({ etat, maintenant }: { etat: EtatEtape; maintenant?: Date }) {
  const { t, i18n } = useTranslation();
  const libelle = (() => {
    if (etat.etape === "posting" && etat.semaine) return t("etapes.postingSemaine", { n: etat.semaine });
    if (etat.etape === "inactive") {
      if (!etat.dernierPost) return t("etapes.inactiveSansPost");
      const date = new Intl.DateTimeFormat(localeDate(i18n.language), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${etat.dernierPost}T12:00:00Z`));
      return t("etapes.inactiveDepuis", { date });
    }
    if (etat.etape === "warming_up" && etat.warmupFin) {
      const { jours, heures } = tempsRestant(etat.warmupFin, maintenant);
      const temps = jours > 0 ? t("etapes.tempsJours", { j: jours, h: heures }) : t("etapes.tempsHeures", { h: Math.max(1, heures) });
      return t("etapes.warmingRestant", { temps });
    }
    return t(`etapes.${etat.etape}`);
  })();
  return (
    <Badge variant={VARIANTE_ETAPE[etat.etape]} data-etape={etat.etape}>
      {libelle}
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
