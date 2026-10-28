import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localeDate } from "@/locales/localeDate";

import { lireCeQueLOsAFait } from "./api";

/**
 * Accueil HM, « What the OS did for your posters » (prompt 15 point 4,
 * prompt 17) : les relances envoyées par l'OS et les inactifs de ses
 * posteurs, en lecture seule, pour qu'elle ne relance pas en double. Elle
 * n'envoie rien.
 */
export function CeQueLOsAFait() {
  const { t, i18n } = useTranslation();
  const liste = useQuery({ queryKey: ["accueil-hm", "os-a-fait"], queryFn: lireCeQueLOsAFait });
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage), { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  return (
    <Card data-testid="os-a-fait">
      <CardHeader>
        <CardTitle>{t("nudges.osAFait.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("nudges.osAFait.desc")}</p>
      </CardHeader>
      <CardContent>
        {liste.data && liste.data.length === 0 && <p className="text-sm text-muted-foreground">{t("nudges.osAFait.vide")}</p>}
        {(liste.data ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border text-sm">
            {liste.data!.map((l, i) => (
              <li key={`${l.poster_id}-${l.quoi}-${l.type ?? ""}-${i}`} className="flex flex-wrap items-center gap-1.5 p-2.5">
                <span className="font-medium">{l.poster_nom ?? "—"}</span>
                {l.quoi === "inactif" ? (
                  <Badge variant="error">{t("nudges.osAFait.inactif")}</Badge>
                ) : (
                  <>
                    <Badge variant="secondary">{t(`nudges.types.${l.type}`, { defaultValue: l.type ?? "" })}</Badge>
                    {l.canal && <span className="text-xs text-muted-foreground">{t(`nudges.canaux.${l.canal}`)}</span>}
                    {l.resolu_at && <Badge variant="success">{t("nudges.etats.resolu")}</Badge>}
                  </>
                )}
                <span className="text-xs text-muted-foreground">· {fmt.format(new Date(l.le))}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
