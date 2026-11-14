import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Aide } from "@/features/moteur/repartition/graphes";
import { drapeauLangue } from "@/features/moteur/langues";

import { type FichePod, languesParComptes, libelleChangement, lireFichesPods } from "./api";
import { parJourVoie1 } from "./rythme";

const pourcent = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)} %`);

/** Une ligne « libellé : valeur » de la fiche. */
function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-44">{libelle}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** La fiche d'un podz : ce qu'il est, ce qu'il a fait aujourd'hui, ce qui décide de son rythme. */
export function FichePodz({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data, error } = useQuery({ queryKey: ["pods", "fiches"], queryFn: lireFichesPods, staleTime: 60_000 });
  if (error) return <p className="text-sm text-destructive">{t("pods.fiche.erreur", { message: (error as Error).message })}</p>;
  const fiche = data?.find((f) => f.slug === slug);
  if (!fiche) return null;
  return <ContenuFiche fiche={fiche} />;
}

export function ContenuFiche({ fiche }: { fiche: FichePod }) {
  const { t } = useTranslation();
  const r = fiche.resultats;
  const parJour = fiche.voie === 1 ? parJourVoie1(fiche.slug) : null;
  const langues = languesParComptes(fiche.comptes_par_langue);
  return (
    <section className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm" aria-label={t("pods.fiche.titre")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("pods.fiche.titre")}</span>
        <Badge variant="secondary">{t(fiche.voie === 1 ? "pods.fiche.voie1" : "pods.fiche.voie2")}</Badge>
        {fiche.cent_podz && (
          <span className="inline-flex items-center gap-1">
            <Badge variant="outline">{t("pods.fiche.centPodz")}</Badge>
            <Aide libelle={t("pods.fiche.centPodz")}>{t("pods.fiche.centPodzAide")}</Aide>
          </span>
        )}
      </div>
      <dl className="space-y-1.5">
        <Ligne libelle={`${t("pods.fiche.comptes")} (${fiche.comptes})`}>
          {langues.length ? (
            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
              {langues.map(([langue, n]) => (
                <span key={langue} className="whitespace-nowrap">
                  {drapeauLangue(langue)} {langue} {n}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-destructive">{t("pods.fiche.aucunCompte")}</span>
          )}
        </Ligne>
        <Ligne libelle={t("pods.fiche.publies")}>{fiche.publies_15j}</Ligne>
        <Ligne libelle={t("pods.fiche.aujourdhui")}>
          {t("pods.fiche.aujourdhuiDetail", {
            ft: fiche.aujourdhui.full_test,
            decl: fiche.aujourdhui.declinaison,
            remake: fiche.aujourdhui.remake,
            attente: fiche.aujourdhui.a_valider,
            rejet: fiche.aujourdhui.rejetees,
          })}
        </Ligne>
        {fiche.boite && (
          <>
            <Ligne libelle={t("pods.fiche.boite")}>
              {t("pods.fiche.boiteDetail", {
                familles: fiche.boite.familles,
                semaines: fiche.boite.semaines.toLocaleString(),
                part: pourcent(fiche.boite.part_full_test),
              })}
            </Ligne>
            <Ligne libelle={t("pods.fiche.livre")}>{fiche.boite.livre_par_jour.toLocaleString()}</Ligne>
          </>
        )}
        {r && (
          <>
            <Ligne libelle={t("pods.fiche.verdicts")}>
              {t("pods.fiche.verdictsDetail", {
                ftg: r.full_tests_gagnants,
                ftj: r.full_tests_juges,
                dg: r.declinaisons_gagnantes,
                dj: r.declinaisons_jugees,
                attente: r.en_attente,
              })}
            </Ligne>
            <Ligne libelle={t("pods.fiche.taux")}>
              {t("pods.fiche.tauxDetail", { taux: pourcent(r.taux), flotte: pourcent(r.taux_flotte) })}
            </Ligne>
          </>
        )}
        <Ligne libelle={t("pods.fiche.rythme")}>
          {fiche.voie === 2
            ? t("pods.fiche.rythmeVoie2")
            : r
              ? parJour !== null
                ? t("pods.fiche.rythmeVoie1", { par_jour: parJour, changement: libelleChangement(r.changement), raison: r.raison })
                : t("pods.fiche.rythmeVoie1SansFichier", { changement: libelleChangement(r.changement), raison: r.raison })
              : parJour ?? "—"}
        </Ligne>
      </dl>
      <p className="text-xs text-muted-foreground">{t("pods.fiche.quiDecide")}</p>
    </section>
  );
}
