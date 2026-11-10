import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sourcesDeLaSemaine, type DecisionSourceLundi } from "@/features/moteur/api";
import { trierSourcesLundi, VARIANTE_DECISION } from "@/features/moteur/lundiSources";

/**
 * Le compte rendu de la mise à jour des sources du lundi (règle A11, 0667) :
 * chaque lundi à 6 h 07, les sources dont les posts font mieux que la médiane
 * de nos comptes (ou que leur label), qui ont eu un post à 100 000 vues, ou
 * neuves, sont retenues ; elles sont mises à jour par lots de 6 par jour. Les
 * autres attendent la semaine suivante.
 */
export function LundiSourcesPanel() {
  const { t, i18n } = useTranslation();
  const semaine = useQuery({ queryKey: ["sources-lundi"], queryFn: sourcesDeLaSemaine, refetchInterval: 60_000 });
  const fmt = (n: number | null) =>
    n === null ? "—" : n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (semaine.isPending || semaine.isError) return null;
  const donnees = semaine.data;
  const sources = donnees ? trierSourcesLundi(donnees.sources) : [];
  const compte = (d: DecisionSourceLundi) => sources.filter((s) => s.decision === d).length;
  const retenues = sources.filter((s) => s.decision !== "pas_maj");
  const enAttente = retenues.filter((s) => !s.lanceeLe).length;
  const importes = sources.reduce((n, s) => n + s.importes, 0);
  const valides = sources.reduce((n, s) => n + s.valides, 0);
  const lundi = donnees
    ? new Date(`${donnees.semaine}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long" })
    : null;

  return (
    <Card data-testid="lundi-sources">
      <CardHeader>
        <CardTitle>{t("sources.lundi.titre")}</CardTitle>
        <CardDescription>{t("sources.lundi.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        {!donnees ? (
          <p className="text-sm text-muted-foreground">{t("sources.lundi.jamais")}</p>
        ) : (
          <>
            <p className="text-sm" data-testid="lundi-sources-resume">
              {t("sources.lundi.resume", {
                date: lundi,
                maj: compte("maj") + compte("peu_de_mesures"),
                pasMaj: compte("pas_maj"),
                importes,
                valides,
              })}
              {enAttente > 0 && ` ${t("sources.lundi.lotsAVenir", { count: enAttente })}`}
            </p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("sources.lundi.colSource")}</th>
                  <th className="pb-2 font-medium">{t("sources.lundi.colLabel")}</th>
                  <th className="pb-2 text-right font-medium">{t("sources.lundi.colR")}</th>
                  <th className="pb-2 text-right font-medium">{t("sources.lundi.colRLabel")}</th>
                  <th className="pb-2 pl-3 font-medium">{t("sources.lundi.colDecision")}</th>
                  <th className="pb-2 text-right font-medium">{t("sources.lundi.colImportes")}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.compteReferenceId} className="border-b last:border-0" data-testid="lundi-source">
                    <td className="py-1.5">@{s.handle}</td>
                    <td className="py-1.5 text-muted-foreground">{s.label ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums" title={t("sources.lundi.postsBulle", { count: s.posts })}>
                      {fmt(s.r)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{s.rVsLabel === null ? "—" : `×${fmt(s.rVsLabel)}`}</td>
                    <td className="py-1.5 pl-3">
                      <Badge variant={VARIANTE_DECISION[s.decision]}>{t(`sources.lundi.decision.${s.decision}`)}</Badge>
                      {s.decision === "maj" && s.raison && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t(`sources.lundi.raison.${s.raison}`, {
                            vues: (s.meilleurVues ?? 0).toLocaleString(i18n.language),
                            defaultValue: s.raison,
                          })}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.decision === "pas_maj"
                        ? "—"
                        : s.lanceeLe
                          ? t("sources.lundi.importes", { importes: s.importes, valides: s.valides })
                          : t("sources.lundi.lotAVenir")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
