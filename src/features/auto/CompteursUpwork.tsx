import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { lireCompteursUpwork } from "./api";

/**
 * Décisions finales 4 : dans Health, les messages partis sur Upwork par jour
 * et par type (7 jours), ceux confiés aux HM (à la main), et ce qui attend.
 */
export function CompteursUpwork() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["auto", "compteurs-upwork"], queryFn: lireCompteursUpwork, refetchInterval: 5 * 60_000 });
  const d = lu.data;
  const jours = [...new Set((d?.jours ?? []).map((x) => x.jour))];
  const types = [...new Set((d?.jours ?? []).map((x) => x.type))].sort();
  const cellule = (jour: string, type: string) => d?.jours.find((x) => x.jour === jour && x.type === type);
  const libelle = (type: string) => t(`autoOnglets.attente.types.${type}`, { defaultValue: type });
  return (
    <div className="space-y-1" data-testid="compteurs-upwork">
      <p className="font-medium">{t("auto.sante.compteurs.titre")}</p>
      {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
      {d && jours.length === 0 && <p className="text-muted-foreground">{t("auto.sante.compteurs.vide")}</p>}
      {jours.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="pr-3 text-left font-medium">{t("auto.sante.compteurs.jour")}</th>
                {types.map((ty) => <th key={ty} className="px-2 text-right font-medium">{libelle(ty)}</th>)}
              </tr>
            </thead>
            <tbody>
              {jours.map((j) => (
                <tr key={j} data-jour={j}>
                  <td className="pr-3 tabular-nums">{j.slice(8, 10)}/{j.slice(5, 7)}</td>
                  {types.map((ty) => {
                    const c = cellule(j, ty);
                    return (
                      <td key={ty} className="px-2 text-right tabular-nums">
                        {c ? t("auto.sante.compteurs.cellule", { upwork: c.upwork, hm: c.hm }) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && d.attente.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="compteurs-attente">
          {t("auto.sante.compteurs.attente")}{" "}
          {d.attente.map((a) => t("auto.sante.compteurs.attenteType", { type: libelle(a.type), n: a.n, main: a.main })).join(" · ")}
        </p>
      )}
    </div>
  );
}
