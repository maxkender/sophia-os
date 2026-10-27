import type { TFunction } from "i18next";

import { localeDate } from "@/locales/localeDate";

import { tempsRestant, type EtatEtape } from "./etapes";

/**
 * Le texte d'une étape, les mêmes mots partout (badges, export). `dateIso` :
 * la date du dernier post en AAAA-MM-JJ (export) plutôt que « 15 oct. ».
 */
export function libelleEtape(
  etat: EtatEtape,
  t: TFunction,
  langue: string,
  o: { maintenant?: Date; dateIso?: boolean } = {},
): string {
  if (etat.etape === "posting" && etat.semaine) return t("etapes.postingSemaine", { n: etat.semaine });
  if (etat.etape === "inactive") {
    if (!etat.dernierPost) return t("etapes.inactiveSansPost");
    const date = o.dateIso
      ? etat.dernierPost
      : new Intl.DateTimeFormat(localeDate(langue), { day: "numeric", month: "short", timeZone: "UTC" }).format(
          new Date(`${etat.dernierPost}T12:00:00Z`),
        );
    return t("etapes.inactiveDepuis", { date });
  }
  if (etat.etape === "warming_up" && etat.warmupFin) {
    const { jours, heures } = tempsRestant(etat.warmupFin, o.maintenant);
    const temps = jours > 0 ? t("etapes.tempsJours", { j: jours, h: heures }) : t("etapes.tempsHeures", { h: Math.max(1, heures) });
    return t("etapes.warmingRestant", { temps });
  }
  return t(`etapes.${etat.etape}`);
}
