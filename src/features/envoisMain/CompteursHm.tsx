import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { lireCompteursHm } from "./api";

const TH = "px-2 py-1.5 text-right text-xs font-medium text-muted-foreground";
const TD = "px-2 py-1.5 whitespace-nowrap text-right tabular-nums";

/**
 * Prompt 25 MAJ, point 8 : par HM, les messages à envoyer à la main, envoyés,
 * vérifiés sur Upwork et en retard, aujourd'hui et sur 7 jours (Health,
 * Messages sent → By hand, et la page de Lucia). La HM ne voit que sa ligne.
 */
export function CompteursHm() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["envois-main-compteurs"], queryFn: lireCompteursHm, refetchInterval: 5 * 60_000 });
  const lignes = lu.data ?? [];
  const cellule = (v: number, alerte = false) => <td className={`${TD} ${alerte && v > 0 ? "font-semibold text-destructive" : ""}`}>{v}</td>;
  return (
    <Card data-testid="compteurs-hm">
      <CardHeader>
        <CardTitle className="text-base">{t("envoisMain.compteurs.titre")}</CardTitle>
        <CardDescription>{t("envoisMain.compteurs.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {lu.data && lignes.length === 0 && <p className="text-muted-foreground">{t("envoisMain.compteurs.vide")}</p>}
        {lignes.length > 0 && (
          <table className="w-full">
            <thead>
              <tr>
                <th />
                <th />
                <th colSpan={4} className={`${TH} text-center`}>{t("envoisMain.compteurs.jour")}</th>
                <th colSpan={4} className={`${TH} text-center`}>{t("envoisMain.compteurs.semaine")}</th>
              </tr>
              <tr className="border-b">
                <th className={`${TH} text-left`}>{t("envoisMain.compteurs.hm")}</th>
                <th className={TH}>{t("envoisMain.compteurs.maintenant")}</th>
                {[0, 1].flatMap((i) =>
                  (["crees", "envoyes", "verifies", "retard"] as const).map((k) => <th key={`${i}${k}`} className={TH}>{t(`envoisMain.compteurs.${k}`)}</th>),
                )}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.hm_id ?? "—"} className="border-b border-border/40" data-compteurs-hm={l.hm_id ?? "aucune"}>
                  <td className="px-2 py-1.5">{l.hm_nom ?? "—"}</td>
                  {cellule(l.a_envoyer, true)}
                  {cellule(l.crees_jour)}
                  {cellule(l.envoyes_jour)}
                  {cellule(l.verifies_jour)}
                  {cellule(l.retard_jour, true)}
                  {cellule(l.crees_7j)}
                  {cellule(l.envoyes_7j)}
                  {cellule(l.verifies_7j)}
                  {cellule(l.retard_7j, true)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
