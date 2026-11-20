import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ecrireEtatManuelLabel } from "@/features/moteur/repartition/apiRepartition";
import { ReaffectationLabelFerme } from "@/features/moteur/repartition/ReaffectationLabelFerme";
import { cn } from "@/lib/utils";

import { FENETRE_JOURS, lireDetailLabel, SEUIL_PERCEE, type EtatPercee, type LigneCompte } from "./detailLabel";

const TH = "pb-1.5 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-1 pr-3 align-baseline";

function Chiffre({ valeur, libelle, testid }: { valeur: string; libelle: string; testid?: string }) {
  return (
    <div className="min-w-24 rounded-md border bg-background px-3 py-2" data-testid={testid}>
      <p className="text-base font-semibold tabular-nums">{valeur}</p>
      <p className="text-[11px] text-muted-foreground">{libelle}</p>
    </div>
  );
}

const TON_ETAT: Record<EtatPercee, string> = {
  perce: "border-success/50 bg-success/10 text-success",
  pas_perce: "text-muted-foreground",
  warmup: "text-muted-foreground",
  sans_post: "text-muted-foreground",
};

/**
 * Le détail d'un label (20/11), dans sa ligne dépliée de la page Labels : ce
 * qu'il fait en vues sur 30 jours, ses comptes TikTok, ceux qui ont percé, et
 * « Arrêter le label ». L'arrêt montre d'abord où irait chaque compte
 * (propositions, rien n'est écrit) ; valider ferme le label pour ses
 * applications puis déplace les comptes.
 */
export function DetailLabel({ labelId, nom, applicationIds }: { labelId: string; nom: string; applicationIds: string[] }) {
  const { t, i18n } = useTranslation();
  const [arret, setArret] = React.useState(false);
  const detail = useQuery({ queryKey: ["detail-label", labelId], queryFn: () => lireDetailLabel(labelId), staleTime: 60_000 });
  const n = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat(i18n.language).format(v));
  const d = detail.data;

  const fermer = async () => {
    // L'un après l'autre : chaque écriture relit puis réécrit le même réglage.
    for (const applicationId of applicationIds) await ecrireEtatManuelLabel({ applicationId, labelId, etat: "ferme" });
  };

  return (
    <div className="space-y-3" data-testid="detail-label">
      {detail.isPending && <p className="text-xs text-muted-foreground">{t("common.loading")}</p>}
      {detail.isError && <p className="text-xs text-destructive">{(detail.error as Error).message}</p>}
      {d && (
        <>
          <div className="flex flex-wrap gap-2">
            <Chiffre testid="detail-comptes" valeur={n(d.nbComptes)} libelle={t("labelsPage.detail.comptes")} />
            <Chiffre testid="detail-perces" valeur={`${n(d.nbPerces)} / ${n(d.nbComptes)}`} libelle={t("labelsPage.detail.perces", { seuil: n(SEUIL_PERCEE) })} />
            <Chiffre valeur={n(d.posts)} libelle={t("labelsPage.detail.posts", { jours: FENETRE_JOURS })} />
            <Chiffre testid="detail-mediane" valeur={n(d.mediane)} libelle={t("labelsPage.detail.mediane")} />
            <Chiffre valeur={n(d.meilleure)} libelle={t("labelsPage.detail.meilleure")} />
            <Chiffre valeur={n(d.percees)} libelle={t("labelsPage.detail.postsPerces")} />
          </div>
          {d.nbComptes > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="detail-cases">
              {(["star", "bien", "passable", "mauvaises_vues", "inactif"] as const)
                .filter((c) => d.parCase[c] > 0)
                .map((c) => `${d.parCase[c]} ${t(`classement.${c}`)}`)
                .join(" · ")}
              {d.nbWarmup > 0 && ` · ${t("labelsPage.detail.enWarmup", { n: d.nbWarmup })}`}
            </p>
          )}
          {d.nbComptes === 0 ? (
            <p className="text-xs text-muted-foreground">{t("labelsPage.detail.aucunCompte")}</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border bg-background p-2">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={TH}>{t("labelsPage.detail.colCompte")}</th>
                    <th className={TH}>{t("labelsPage.detail.colMarche")}</th>
                    <th className={TH}>{t("labelsPage.detail.colEtat")}</th>
                    <th className={cn(TH, "text-right")}>{t("labelsPage.detail.colPosts")}</th>
                    <th className={cn(TH, "text-right")}>{t("labelsPage.detail.colMediane")}</th>
                    <th className={cn(TH, "text-right")}>{t("labelsPage.detail.colMeilleure")}</th>
                    <th className={TH}>{t("labelsPage.detail.colCase")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.comptes.map((c: LigneCompte) => (
                    <tr key={c.id} className="border-t border-border/40" data-testid={`detail-compte-${c.handle ?? c.id}`}>
                      <td className={TD}>
                        {c.handle ? (
                          <a className="font-mono hover:underline" href={`https://www.tiktok.com/@${c.handle}`} target="_blank" rel="noreferrer">@{c.handle}</a>
                        ) : (
                          <span className="font-mono text-muted-foreground">{c.id.slice(0, 8)}</span>
                        )}
                        {c.posteur && <span className="ml-2 text-muted-foreground">{c.posteur}</span>}
                      </td>
                      <td className={cn(TD, "text-muted-foreground")}>{[c.langue, c.pays].filter(Boolean).join(" · ")}</td>
                      <td className={TD}>
                        <Badge variant="outline" className={TON_ETAT[c.etat]}>
                          {t(`labelsPage.detail.etat.${c.etat}`, { n: c.percees })}
                        </Badge>
                      </td>
                      <td className={cn(TD, "text-right tabular-nums")}>{n(c.posts)}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{n(c.mediane)}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>
                        {c.meilleureUrl ? <a className="hover:underline" href={c.meilleureUrl} target="_blank" rel="noreferrer">{n(c.meilleure)}</a> : n(c.meilleure)}
                      </td>
                      <td className={cn(TD, "text-muted-foreground")}>{c.classement ? t(`classement.${c.classement}`) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{t("labelsPage.detail.aide", { jours: FENETRE_JOURS, seuil: n(SEUIL_PERCEE) })}</p>
        </>
      )}
      {arret ? (
        <ReaffectationLabelFerme
          labelId={labelId}
          nom={nom}
          titre={t("labelsPage.detail.arretTitre", { nom })}
          avantAppliquer={fermer}
          onFini={() => setArret(false)}
        />
      ) : (
        <Button size="sm" variant="outline" className="text-destructive" disabled={applicationIds.length === 0} data-testid="arreter-label" onClick={() => setArret(true)}>
          {t("labelsPage.detail.arreter")}
        </Button>
      )}
    </div>
  );
}
