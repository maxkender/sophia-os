import { useTranslation } from "react-i18next";

import { localeDate } from "@/locales/localeDate";

import type { ADecider } from "./api";
import { raison } from "./logique";

/** La raison d'une proposition, en une phrase avec ses nombres (À décider, cartes de Weekly decisions). */
export function useRaison() {
  const { t, i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "fr");
  const jour = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  const n = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString(langue));
  return (p: ADecider) => {
    const r = raison(p);
    switch (r.cle) {
      case "inactif":
        return r.mercredi ? t("decisions.raison.inactif", { date: jour.format(new Date(r.mercredi)) }) : t("decisions.raison.inactifSansMessage");
      case "absent":
        return t("decisions.raison.absent", { manques: r.manques, attendus: r.attendus });
      case "premiere_semaine":
        return r.haut === null ? t("decisions.raison.premiereSansVues", { n: r.publies }) : t("decisions.raison.premiere", { n: r.publies, vues: n(r.haut) });
      case "anciens":
        return t("decisions.raison.anciens", { mediane: n(r.mediane), reference: n(r.reference) });
      case "doubler":
        return t("decisions.raison.doubler", { n: r.bons, seuil: n(r.seuil) });
      case "reveil":
        return t("decisions.raison.reveil");
      case "shadowban":
        return t("decisions.raison.shadowban");
      default:
        return "";
    }
  };
}
