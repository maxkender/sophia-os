import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import { localeDate } from "@/locales/localeDate";

import { mesRecreations } from "./api";

/**
 * Espace du posteur : son compte a été recréé (0368). Dit quoi faire, dans la
 * langue de son interface : créer le nouveau compte sur TikTok, lancer le
 * warm-up avant dimanche minuit, reprise des posts le lundi.
 */
export function BandeauRecreation({ actif }: { actif: boolean }) {
  const { t, i18n } = useTranslation();
  const recreations = useQuery({
    queryKey: ["mes-recreations"],
    queryFn: mesRecreations,
    enabled: actif,
    staleTime: 5 * 60_000,
  });
  const r = recreations.data?.[0];
  if (!r) return null;
  const jour = (j: string, semaine: boolean) =>
    new Intl.DateTimeFormat(localeDate(i18n.language), {
      ...(semaine ? { weekday: "long" } : {}),
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${j}T12:00:00Z`));
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm leading-relaxed"
      data-testid="bandeau-recreation"
    >
      <RefreshCw className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden />
      <p>
        {t("recreationPosteur.texte", {
          ancien: r.ancien_handle ?? "?",
          nouveau: r.nouveau_handle ?? "?",
          le: jour(r.le, false),
          lundi: jour(r.lundi, true),
        })}
      </p>
    </div>
  );
}
