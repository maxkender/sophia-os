import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lireInterrupteurs } from "@/features/interrupteurs/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireArrets, marquerActionArret, type Arret, type EtapeArret } from "./api";

const VARIANTE: Record<EtapeArret["statut"], "success" | "info" | "error" | "warning" | "secondary"> = {
  fait: "success",
  simule: "info",
  erreur: "error",
  a_faire: "warning",
  sans_objet: "secondary",
};

/** Les actions qu'on peut marquer faites à la main. */
const A_LA_MAIN = new Set<EtapeArret["action"]>(["slack", "remboursement", "fermeture", "message"]);

/**
 * Système du 2 nov., partie C : les arrêts complets (14 jours, et ceux qui
 * ont encore une action à faire). Chaque action et son état ; une action en
 * échec met la ligne en rouge. « À retirer de Slack » en tête.
 */
export function Arrets() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const arrets = useQuery({ queryKey: ["arrets"], queryFn: lireArrets });
  const interrupteurs = useQuery({ queryKey: ["interrupteurs"], queryFn: lireInterrupteurs });
  const marquer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "slack" | "remboursement" | "fermeture" | "message" }) => marquerActionArret(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["arrets"] }),
  });
  const mode = interrupteurs.data?.arret_auto ?? "test";
  const liste = arrets.data ?? [];
  const slack = liste.filter((a) => a.etapes.some((e) => e.action === "slack" && e.statut === "a_faire"));
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  const marquerFait = (a: Arret, action: "slack" | "remboursement" | "fermeture" | "message") => {
    if (window.confirm(t("cohortes.arrets.faitConfirm", { action: t(`cohortes.arrets.actions.${action}`), nom: a.poster_nom ?? "—" }))) {
      marquer.mutate({ id: a.id, action });
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="arrets">
      <div className="flex flex-wrap items-center gap-2">
        <UserX className="size-4" aria-hidden />
        <h2 className="font-semibold">{t("cohortes.arrets.titre")}</h2>
        <Badge variant={mode === "on" ? "success" : mode === "test" ? "warning" : "secondary"}>{t(`interrupteurs.modes.${mode}`)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t(`cohortes.arrets.aide.${mode}`)}</p>
      {arrets.error && <p className="text-sm text-destructive">{(arrets.error as Error).message}</p>}
      {marquer.error && <p className="text-sm text-destructive">{(marquer.error as Error).message}</p>}

      {slack.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-testid="a-retirer-slack">
          <p className="font-medium">{t("cohortes.arrets.slack", { n: slack.length })}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {slack.map((a) => (
              <li key={a.id} className="inline-flex items-center gap-1">
                {a.poster_nom ?? "—"}
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={marquer.isPending} onClick={() => marquerFait(a, "slack")}>
                  {t("cohortes.arrets.retire")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {liste.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("cohortes.arrets.vide")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {liste.map((a) => (
            <li key={a.id} className={cn("space-y-1 px-3 py-2 text-sm", a.statut === "erreur" && "bg-destructive/5")} data-arret={a.id}>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.poster_nom ?? "—"}</span>
                {a.hm_prenom && <span className="text-xs text-muted-foreground">{t("cohortes.kills.hm", { hm: a.hm_prenom })}</span>}
                <span className="text-xs text-muted-foreground">
                  {t(`cohortes.arrets.sources.${a.source}`)} · {fmt.format(new Date(a.created_at))}
                </span>
                {a.a_poste !== null && (
                  <span className="text-xs text-muted-foreground">{t(a.a_poste ? "cohortes.arrets.aPoste" : "cohortes.arrets.jamaisPoste")}</span>
                )}
                <Badge variant={a.statut === "erreur" ? "error" : a.statut === "fait" ? "success" : "warning"}>
                  {t(`cohortes.arrets.statuts.${a.statut}`)}
                </Badge>
              </p>
              {a.etapes.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {a.etapes.map((e) => (
                    <li key={e.action} className="inline-flex items-center gap-1 text-xs" title={e.detail ?? undefined} data-etape={e.action}>
                      <Badge variant={VARIANTE[e.statut]}>
                        {t(`cohortes.arrets.actions.${e.action}`)} : {t(`cohortes.arrets.etats.${e.statut}`)}
                      </Badge>
                      {(e.statut === "erreur" || e.statut === "a_faire") && e.detail && (
                        <span className={cn(e.statut === "erreur" ? "text-destructive" : "text-muted-foreground")}>{e.detail}</span>
                      )}
                      {A_LA_MAIN.has(e.action) && (e.statut === "a_faire" || e.statut === "erreur") && e.action !== "slack" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={marquer.isPending}
                          onClick={() => marquerFait(a, e.action as "remboursement" | "fermeture" | "message")}
                        >
                          {t("cohortes.arrets.faitMain")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
