import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type FichePod, libelleChangement } from "./api";
import { parJourVoie1 } from "./rythme";

const pourcent = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)} %`);

/** Une ligne « libellé : valeur ». */
export function LigneFiche({ libelle, children }: { libelle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/40 py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-48">{libelle}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** Ce que le podz a fait aujourd'hui, et ce qui décide de son rythme (`pods_fiches`, 0716). */
export function RythmePodz({ fiche }: { fiche: FichePod }) {
  const { t } = useTranslation();
  const r = fiche.resultats;
  const parJour = fiche.voie === 1 ? parJourVoie1(fiche.slug) : null;
  return (
    <div className="space-y-3">
      <dl>
        <LigneFiche libelle={t("pods.fiche.rythme")}>
          {fiche.voie === 2
            ? t("pods.fiche.rythmeVoie2")
            : r
              ? parJour !== null
                ? t("pods.fiche.rythmeVoie1", { par_jour: parJour, changement: libelleChangement(r.changement), raison: r.raison })
                : t("pods.fiche.rythmeVoie1SansFichier", { changement: libelleChangement(r.changement), raison: r.raison })
              : parJour ?? "—"}
        </LigneFiche>
        <LigneFiche libelle={t("pods.fiche.aujourdhui")}>
          {t("pods.fiche.aujourdhuiDetail", {
            ft: fiche.aujourdhui.full_test,
            decl: fiche.aujourdhui.declinaison,
            remake: fiche.aujourdhui.remake,
            attente: fiche.aujourdhui.a_valider,
            rejet: fiche.aujourdhui.rejetees,
          })}
        </LigneFiche>
        <LigneFiche libelle={t("pods.fiche.publies")}>{fiche.publies_15j}</LigneFiche>
        {fiche.boite && (
          <>
            <LigneFiche libelle={t("pods.fiche.boite")}>
              {t("pods.fiche.boiteDetail", {
                familles: fiche.boite.familles,
                semaines: fiche.boite.semaines.toLocaleString(),
                part: pourcent(fiche.boite.part_full_test),
              })}
            </LigneFiche>
            <LigneFiche libelle={t("pods.fiche.livre")}>{fiche.boite.livre_par_jour.toLocaleString()}</LigneFiche>
          </>
        )}
        {r && (
          <>
            <LigneFiche libelle={t("pods.fiche.verdicts")}>
              {t("pods.fiche.verdictsDetail", {
                ftg: r.full_tests_gagnants,
                ftj: r.full_tests_juges,
                dg: r.declinaisons_gagnantes,
                dj: r.declinaisons_jugees,
                attente: r.en_attente,
              })}
            </LigneFiche>
            <LigneFiche libelle={t("pods.fiche.taux")}>
              {t("pods.fiche.tauxDetail", { taux: pourcent(r.taux), flotte: pourcent(r.taux_flotte) })}
            </LigneFiche>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{t("pods.fiche.quiDecide")}</p>
    </div>
  );
}
