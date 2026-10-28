import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { localeDate } from "@/locales/localeDate";

import { lireInactifs, recalculerInactifs, type Inactif } from "./api";

function statutKill(i: Inactif): { cle: string; variante: "secondary" | "warning" | "error" | "success" } {
  if (i.kill_decide === "ne_pas_renouveler") return { cle: "killDecide", variante: "error" };
  if (i.kill_decide === "garder") return { cle: "garde", variante: "success" };
  if (i.kill_propose) return { cle: "killPropose", variante: "warning" };
  return { cle: "samediProchain", variante: "secondary" };
}

/**
 * Inactifs (v3 point 7, règle du prompt 17) : le message du mercredi est parti
 * et le posteur n'a rien publié de lundi à vendredi 20 h (heure de son pays).
 * Marqués toutes les heures par `recrues-check`, proposés en Kill au contrôle
 * du samedi (règle « inactif »), que Max valide.
 */
export function PageInactifs() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["inactifs"], queryFn: lireInactifs });
  const recalcul = useMutation({
    mutationFn: recalculerInactifs,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inactifs"] }),
  });
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  });
  const lignes = liste.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inactifs.titre")}
        description={t("inactifs.description")}
        actions={
          <Button variant="outline" disabled={recalcul.isPending} onClick={() => recalcul.mutate()}>
            <RefreshCw className={recalcul.isPending ? "size-4 animate-spin" : "size-4"} />
            {t("inactifs.recalculer")}
          </Button>
        }
      />
      {recalcul.data && (
        <p className="text-sm" data-testid="bilan-inactifs">
          {t("inactifs.bilan", recalcul.data)}
        </p>
      )}
      {recalcul.error && <p className="text-sm text-destructive">{(recalcul.error as Error).message}</p>}
      <Card>
        <CardContent className="p-0">
          {liste.isLoading && <BarreChargement actif />}
          {liste.error && <p className="p-3 text-sm text-destructive">{(liste.error as Error).message}</p>}
          {liste.data && lignes.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t("inactifs.vide")}</p>}
          {lignes.length > 0 && (
            <ul className="divide-y" data-testid="liste-inactifs">
              {lignes.map((i) => {
                const k = statutKill(i);
                return (
                  <li key={i.poster_id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{i.poster_nom ?? "—"}</span>
                        <Badge variant={k.variante}>{t(`inactifs.kill.${k.cle}`)}</Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          i.hm_prenom ? t("inactifs.hm", { hm: i.hm_prenom }) : null,
                          t("inactifs.joursSansPost", { n: i.jours_sans_post }),
                          i.dernier_post_at ? t("inactifs.dernierPost", { date: fmt.format(new Date(i.dernier_post_at)) }) : t("inactifs.jamaisPoste"),
                          t("inactifs.depuis", { date: fmt.format(new Date(i.depuis)) }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {i.upwork_contrat_url && (
                      <a
                        href={i.upwork_contrat_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        {t("inactifs.contrat")}
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
