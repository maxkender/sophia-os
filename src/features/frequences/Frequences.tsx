import type * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { DEFAUTS, enregistrerFrequences, FREQUENCES, libelleMinutes, lireEtatFrequences, TACHES, type TacheUpwork } from "./api";

const heure = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso)) : "—";

/**
 * Overview → Switches : « Welcome check », « Upwork replies » et « Step
 * checks », chacun 15 min, 30 min, 1 h ou 2 h (admin). Les crons passent
 * toutes les 15 minutes ; le changement vaut au passage suivant. Après un 429,
 * l'intervalle réellement utilisé (doublé pour la journée) est affiché.
 */
export function FrequencesUpwork({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["frequences-upwork"], queryFn: lireEtatFrequences, refetchInterval: 60_000 });
  const reglees = Object.fromEntries(TACHES.map((x) => [x, lu.data?.taches.find((e) => e.tache === x)?.reglee ?? DEFAUTS[x]])) as Record<TacheUpwork, number>;
  const changer = useMutation({
    mutationFn: (v: Record<TacheUpwork, number>) => enregistrerFrequences(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["frequences-upwork"] }),
  });
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="frequences-upwork">
      <p className="text-sm font-medium">{t("frequences.titre")}</p>
      <p className="text-xs text-muted-foreground">{t("frequences.aide")}</p>
      {TACHES.map((x) => {
        const e = lu.data?.taches.find((y) => y.tache === x);
        const double = e && e.effective > e.reglee;
        return (
          <div key={x} className="flex flex-wrap items-center justify-between gap-2" data-frequence={x}>
            <div className="min-w-0">
              <p className="text-sm">{t(`frequences.${x}.titre`)}</p>
              <p className="text-xs text-muted-foreground">
                {t(`frequences.${x}.aide`)} · {t("frequences.dernier", { heure: heure(e?.dernier_at ?? null) })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {double && (
                <Badge variant="warning" data-testid={`effective-${x}`}>
                  {t("frequences.double", { duree: libelleMinutes(e!.effective) })}
                </Badge>
              )}
              <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label={t(`frequences.${x}.titre`)}>
                {FREQUENCES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!admin || changer.isPending}
                    aria-pressed={reglees[x] === m}
                    className={cn("rounded px-2.5 py-1", reglees[x] === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                    onClick={() => changer.mutate({ ...reglees, [x]: m })}
                  >
                    {libelleMinutes(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      {(changer.error || lu.error) && <p className="text-sm text-destructive">{((changer.error ?? lu.error) as Error).message}</p>}
    </div>
  );
}

/**
 * Overview → Health : les appels Upwork du jour et la limite (alerte au-dessus
 * de 30 000). Prompt 22, partie 3 : `children` ajoute la connexion Upwork et
 * le dernier passage des tâches automatiques dans la même carte.
 */
export function CarteSante({ children }: { children?: React.ReactNode } = {}) {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["frequences-upwork"], queryFn: lireEtatFrequences, refetchInterval: 60_000 });
  const d = lu.data;
  const alerte = d ? d.appels_jour > d.alerte : false;
  return (
    <Card data-testid="carte-sante" className={alerte ? "border-destructive/60" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">{t("frequences.sante.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {d && (
          <p className={cn("tabular-nums", alerte && "font-medium text-destructive")} data-testid="appels-upwork">
            {t("frequences.sante.appels", { n: d.appels_jour.toLocaleString("fr-FR"), limite: d.limite.toLocaleString("fr-FR") })}
          </p>
        )}
        {alerte && <p className="text-destructive">{t("frequences.sante.alerte", { seuil: d!.alerte.toLocaleString("fr-FR") })}</p>}
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {children}
      </CardContent>
    </Card>
  );
}
