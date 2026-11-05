import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { localeDate } from "@/locales/localeDate";

import { cycleRituel, faitDansCycle, lireRituelsFaits, type RituelSemaine } from "./rituelsFaits";

const P = "autoOnglets.decisions.fait";

export function useRituelsFaits() {
  return useQuery({ queryKey: ["rituels-faits"], queryFn: lireRituelsFaits, staleTime: 60_000 });
}

/**
 * 5/11 : un rituel fait reste « ✅ fait » jusqu'au même jour de la semaine
 * suivante : un bandeau (quand, et le prochain), et la liste repliée dessous
 * (toujours ouvrable pour revoir ou préparer).
 */
export function RituelFait({ rituel, children, maintenant = new Date() }: { rituel: RituelSemaine; children: React.ReactNode; maintenant?: Date }) {
  const { t, i18n } = useTranslation();
  const lu = useRituelsFaits();
  const aujourdhui = aujourdhuiParis(maintenant);
  const fait = faitDansCycle(lu.data ?? [], rituel, aujourdhui);
  if (!fait) return <>{children}</>;
  const loc = localeDate(i18n.resolvedLanguage ?? "fr");
  const quand = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    .format(new Date(fait.fait_at));
  const prochain = new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${cycleRituel(rituel, aujourdhui).prochain}T12:00:00Z`));
  return (
    <div className="space-y-3" data-testid={`rituel-fait-${rituel}`}>
      <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm font-medium">
        ✅ {t(`${P}.titre`, { rituel: t(`${P}.rituels.${rituel}`), quand })} · {t(`${P}.prochain`, { date: prochain })}
      </p>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">{t(`${P}.revoir`)}</summary>
        <div className="mt-3 space-y-4">{children}</div>
      </details>
    </div>
  );
}
