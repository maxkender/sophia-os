import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, LineChart } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { lireAlerteSuivi, listerSuivi } from "./api";
import { formaterJour, formaterNombre, formaterPart, part } from "./format";
import { EnteteTableau, EtatRequete, Ligne, TD, TD_NUM, TH, TH_NUM, Tableau, TitreCarte } from "./ui";

/**
 * BLEO, vue d'ensemble : le suivi avant/après la bascule (pas d'A/B, décision
 * du 29/10). Jour par jour : r médian (mûr après 72 h), part à 10 000 vues,
 * vues par post, part des passages servis par le plan BLEO ; et l'alerte quand
 * le r médian des derniers jours mesurés baisse de plus de 15 %.
 */
export function CarteSuivi() {
  const { t, i18n } = useTranslation();
  const jours = useQuery({ queryKey: ["bleo", "suivi"], queryFn: () => listerSuivi(21) });
  const alerte = useQuery({ queryKey: ["bleo", "suivi", "alerte"], queryFn: lireAlerteSuivi });
  const a = alerte.data;

  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={LineChart}>{t("bleo.suivi.titre")}</TitreCarte>
        <CardDescription>{t("bleo.suivi.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <EtatRequete erreur={jours.error ?? alerte.error} chargement={jours.isLoading} />
        {a?.jour_fin && a.r_recent != null && a.r_reference != null && (
          a.alerte ? (
            <Alert variant="error">
              <AlertTriangle />
              <AlertTitle>{t("bleo.suivi.alerteTitre", { baisse: formaterPart(a.baisse) })}</AlertTitle>
              <AlertDescription>
                {t("bleo.suivi.alerteDetail", {
                  recent: formaterNombre(a.r_recent, 2),
                  reference: formaterNombre(a.r_reference, 2),
                  n: a.jours_recents,
                  m: a.jours_reference,
                  jour: formaterJour(a.jour_fin, i18n.language),
                })}
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("bleo.suivi.comparaison", {
                recent: formaterNombre(a.r_recent, 2),
                reference: formaterNombre(a.r_reference, 2),
                n: a.jours_recents,
                m: a.jours_reference,
                jour: formaterJour(a.jour_fin, i18n.language),
                ecart: a.baisse == null ? "—" : `${a.baisse > 0 ? "−" : "+"}${formaterPart(Math.abs(a.baisse))}`,
              })}
            </p>
          )
        )}
        {jours.data && jours.data.length > 0 && (
          <Tableau minWidth="40rem">
            <EnteteTableau>
              <th className={TH}>{t("bleo.suivi.jour")}</th>
              <th className={TH_NUM}>{t("bleo.suivi.publies")}</th>
              <th className={TH_NUM}>{t("bleo.suivi.rMedian")}</th>
              <th className={TH_NUM}>{t("bleo.suivi.part10k")}</th>
              <th className={TH_NUM}>{t("bleo.suivi.vuesParPost")}</th>
              <th className={TH_NUM}>{t("bleo.suivi.planBleo")}</th>
            </EnteteTableau>
            <tbody>
              {jours.data.map((j) => {
                const mur = j.publies > 0 && j.mesures >= 0.5 * j.publies;
                return (
                  <Ligne key={j.jour} className={mur ? undefined : "text-muted-foreground"}>
                    <td className={TD}>{formaterJour(j.jour, i18n.language)}</td>
                    <td className={TD_NUM}>{j.publies}</td>
                    <td className={cn(TD_NUM, !mur && "italic")} title={mur ? undefined : t("bleo.suivi.pasMur")}>
                      {mur ? formaterNombre(j.r_median, 2) : "…"}
                    </td>
                    <td className={TD_NUM}>{formaterPart(j.part_10k)}</td>
                    <td className={TD_NUM}>{formaterNombre(j.vues_par_post, 0)}</td>
                    <td className={TD_NUM}>{j.plan_bleo + j.tierlist > 0 ? formaterPart(part(j.plan_bleo, j.assignes)) : "—"}</td>
                  </Ligne>
                );
              })}
            </tbody>
          </Tableau>
        )}
      </CardContent>
    </Card>
  );
}
