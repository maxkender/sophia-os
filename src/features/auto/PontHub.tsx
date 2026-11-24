import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireEtatPontHub } from "./pontHubApi";

/**
 * 0848 (24/11) : « Pont Hub ↔ OS » dans la carte Health : vert, ou rouge quand
 * une action échoue sans interruption depuis plus de 15 min ; la dernière
 * réussite et le dernier échec.
 */
export function PontHub() {
  const { t, i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
  const le = (iso: string | null | undefined) => (iso ? format.format(new Date(iso)) : "—");
  const lu = useQuery({ queryKey: ["auto", "pont-hub"], queryFn: lireEtatPontHub, refetchInterval: 60_000 });
  const e = lu.data;
  const rouge = (e?.incidents.length ?? 0) > 0;
  return (
    <div className="space-y-1" data-testid="pont-hub" data-rouge={rouge || undefined}>
      <p className="flex flex-wrap items-center gap-2 font-medium">
        {t("auto.sante.pont.titre")}
        {e && <Badge variant={rouge ? "error" : "success"}>{t(rouge ? "auto.sante.pont.panne" : "auto.sante.pont.ok")}</Badge>}
      </p>
      {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
      {e?.incidents.map((i) => (
        <p key={i.action} role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 font-medium text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="break-words">
            {t("auto.sante.pont.incident", { action: i.action, depuis: le(i.depuis), n: i.echecs, erreur: i.derniere_erreur ?? "?" })}
          </span>
        </p>
      ))}
      {e && (
        <ul className="text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="size-3.5 shrink-0 text-success-foreground" aria-hidden />
            {t("auto.sante.pont.succes", { quand: le(e.dernier_succes_at) })}
          </li>
          <li className={cn("flex items-center gap-2", rouge && "text-destructive")}>
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span className="break-words">
              {e.dernier_echec
                ? t("auto.sante.pont.echec", {
                  quand: le(e.dernier_echec.at), action: e.dernier_echec.action, code: e.dernier_echec.code,
                  erreur: e.dernier_echec.erreur ?? "—",
                })
                : t("auto.sante.pont.aucunEchec")}
            </span>
          </li>
          <li>{t("auto.sante.pont.appels", { n: e.appels_24h, echecs: e.echecs_24h })}</li>
        </ul>
      )}
    </div>
  );
}
