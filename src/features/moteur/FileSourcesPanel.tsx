import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { attenteParJour, leverEssaiSource, lireFileSources, type EssaiSource } from "@/features/moteur/fileSources";

/**
 * La file d'import des sources (0686). Les imports s'étalent : les mises à
 * jour de la semaine d'abord, puis deux sources neuves par jour au plus ; une
 * source neuve n'importe que ses meilleurs posts tant que son essai n'est pas
 * jugé sur nos comptes.
 */
export function FileSourcesPanel() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const file = useQuery({ queryKey: ["sources-file"], queryFn: lireFileSources, refetchInterval: 60_000 });
  const lever = useMutation({
    mutationFn: (id: string) => leverEssaiSource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources-file"] }),
  });

  if (file.isPending || file.isError) return null;
  const { enCours, attente, essais, reglages } = file.data;
  if (!enCours && attente.length === 0 && essais.length === 0) return null;

  const jour = (d: string | null) =>
    d
      ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" })
      : t("sources.file.sansDate");
  const decimal = (n: number | null) =>
    n === null ? "—" : n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const etat = (e: EssaiSource) =>
    e.verdict === "tient"
      ? t("sources.file.etat.tient", { n: reglages.postsMaxParMaj })
      : e.verdict === "ne_tient_pas"
        ? t("sources.file.etat.ne_tient_pas")
        : t("sources.file.etat.en_cours", { posts: e.posts, min: reglages.essaiMesuresMin });

  return (
    <Card data-testid="file-sources">
      <CardHeader>
        <CardTitle>{t("sources.file.titre")}</CardTitle>
        <CardDescription>
          {t("sources.file.description", {
            lot: reglages.lotMax,
            neuves: reglages.nouvellesParJour,
            essai: reglages.essaiPosts,
            tranche: reglages.postsMaxParMaj,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        {enCours && (
          <p className="text-sm" data-testid="file-en-cours">
            <Badge variant="info">{t("sources.file.enCours")}</Badge>{" "}
            {enCours.handle
              ? t("sources.file.enCoursSource", { handle: enCours.handle, count: enCours.restant })
              : t("sources.file.enCoursDemarre")}
            {enCours.aSuivre.length > 0 && ` ${t("sources.file.aSuivre", { sources: enCours.aSuivre.map((h) => `@${h}`).join(", ") })}`}
          </p>
        )}

        {attente.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("sources.file.attente", { count: attente.length })}</p>
            <ul className="space-y-1.5 text-sm">
              {attenteParJour(attente).map((j) => (
                <li key={j.jour ?? "sans"} data-testid="file-jour">
                  <span className="text-muted-foreground">{jour(j.jour)} : </span>
                  {j.sources.map((s, i) => (
                    <span key={s.compteReferenceId}>
                      {i > 0 && ", "}@{s.handle}
                      {s.sorte === "neuve" && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({s.essaiMax !== null ? t("sources.file.neuveEssai", { n: s.essaiMax }) : t("sources.file.neuve")})
                        </span>
                      )}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("sources.file.auPlusTot")}</p>
          </div>
        )}

        {essais.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("sources.file.essais")}</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("sources.file.colSource")}</th>
                  <th className="pb-2 font-medium">{t("sources.file.colLabel")}</th>
                  <th className="pb-2 text-right font-medium">{t("sources.file.colImportes")}</th>
                  <th className="pb-2 text-right font-medium">{t("sources.file.colR")}</th>
                  <th className="pb-2 text-right font-medium">{t("sources.file.colRLabel")}</th>
                  <th className="pb-2 pl-3 font-medium">{t("sources.file.colEtat")}</th>
                </tr>
              </thead>
              <tbody>
                {essais.map((e) => (
                  <tr key={e.compteReferenceId} className="border-b last:border-0" data-testid="file-essai">
                    <td className="py-1.5">@{e.handle}</td>
                    <td className="py-1.5 text-muted-foreground">{e.label ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {t("sources.file.importes", { importes: e.importes, valides: e.valides })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{decimal(e.r)}</td>
                    <td className="py-1.5 text-right tabular-nums">{e.rVsLabel === null ? "—" : `×${decimal(e.rVsLabel)}`}</td>
                    <td className="py-1.5 pl-3">
                      <Badge variant={e.verdict === "tient" ? "success" : e.verdict === "ne_tient_pas" ? "warning" : "outline"}>
                        {etat(e)}
                      </Badge>
                      {e.verdict !== "tient" && (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="ml-2"
                          disabled={lever.isPending}
                          onClick={() => {
                            if (window.confirm(t("sources.file.leverConfirme", { handle: e.handle, n: reglages.postsMaxParMaj }))) {
                              lever.mutate(e.compteReferenceId);
                            }
                          }}
                        >
                          {t("sources.file.lever")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lever.error && <p className="text-xs text-destructive">{(lever.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
