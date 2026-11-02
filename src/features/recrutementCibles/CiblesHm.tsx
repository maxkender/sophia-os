import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { CLE_CIBLES, listerCiblesRecrutement } from "./api";
import { parCohorte } from "./logique";

/**
 * Prompt 21, D : côté HM, ses cibles par pays (cible, recrutés, écart).
 * `prochaines` : seulement les cohortes à venir (en haut de « My cohort ») ;
 * sinon les 3 dernières semaines aussi (page « Recruit »).
 */
export function CiblesRecrutementHm({ prochaines = false }: { prochaines?: boolean }) {
  const { t, i18n } = useTranslation();
  const donnees = useQuery({ queryKey: [...CLE_CIBLES, "hm"], queryFn: () => listerCiblesRecrutement() });
  const cohortes = parCohorte(donnees.data ?? [], {
    avecCible: true,
    depuis: prochaines ? aujourdhuiParis() : undefined,
  });
  const date = (j: string) =>
    new Date(`${j}T12:00:00Z`).toLocaleDateString(localeDate(i18n.resolvedLanguage), { day: "numeric", month: "long" });
  return (
    <Card data-testid="cibles-recrutement-hm">
      <CardHeader>
        <CardTitle>{t("recrutementCibles.titreHm")}</CardTitle>
        <CardDescription>{t("recrutementCibles.descHm")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}
        {donnees.data && cohortes.length === 0 && <p className="text-sm text-muted-foreground">{t("recrutementCibles.vide")}</p>}
        {cohortes.map((c) => (
          <div key={c.cohorte} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("recrutementCibles.cohorte")} · {date(c.cohorte)} · {c.recrutes}/{c.cible}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("recrutementCibles.pays")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("recrutementCibles.cible")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("recrutementCibles.recrutes")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("recrutementCibles.ecart")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {c.lignes.map((l) => (
                    <tr key={l.pays}>
                      <td className="px-3 py-2">
                        {drapeauPays(l.pays)} {nomPaysIso(l.pays)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.cible}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.recrutes}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", l.ecart > 0 && "font-semibold text-warning-foreground")}>
                        {l.ecart > 0 ? l.ecart : <Badge variant="success">{t("recrutementCibles.atteint")}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
