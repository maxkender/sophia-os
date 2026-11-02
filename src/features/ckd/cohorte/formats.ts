import * as React from "react";
import { useTranslation } from "react-i18next";

import { localeDate } from "@/locales/localeDate";

/**
 * Les dates du suivi par cohorte, dans la langue de l'interface et à l'heure
 * de Paris. Une date seule (« 2026-10-24 ») est un jour de Paris : midi évite
 * tout décalage.
 */
export function useFormats() {
  const { t, i18n } = useTranslation();
  const date = React.useCallback(
    (iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) => {
      if (!iso) return "";
      const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
      return new Intl.DateTimeFormat(localeDate(i18n.language), { timeZone: "Europe/Paris", ...options }).format(d);
    },
    [i18n.language],
  );
  const duree = React.useCallback(
    (r: { jours: number; heures: number; minutes: number }) =>
      r.jours > 0
        ? t("ckd.cohorte.duree.jh", { j: r.jours, h: r.heures })
        : r.heures > 0
          ? t("ckd.cohorte.duree.hm", { h: r.heures, m: r.minutes })
          : t("ckd.cohorte.duree.m", { m: r.minutes }),
    [t],
  );
  const nombre = React.useCallback((n: number) => n.toLocaleString(localeDate(i18n.language)), [i18n.language]);
  return { date, duree, nombre };
}

/** « 1,4k » : les vues d'un post dans une case étroite. */
export function vuesCourtes(n: number, langue: string): string {
  if (n < 1000) return String(n);
  return `${(Math.round(n / 100) / 10).toLocaleString(localeDate(langue))}k`;
}
