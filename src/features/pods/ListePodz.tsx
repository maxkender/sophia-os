// La liste des podz : une ligne par podz, rangée par application puis par label.
import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { nomAffiche } from "@/components/brand/identiteApplications";
import { abrege } from "@/components/charts/echelle";
import { Card } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Segments } from "@/components/ui/segments";
import { canoniserLangue, drapeauLangue } from "@/features/moteur/langues";
import { SEUIL_STOCK_JOURS } from "@/features/moteur/pilotage";
import { Aide, BarreReserve } from "@/features/moteur/repartition/graphes";
import { cn } from "@/lib/utils";

import { autonomieMin, type OuvertureLangue } from "./api";
import { EtiquetteEtat, EtiquetteFormat, LienCompte } from "./Etiquettes";
import {
  etatLangues,
  filtrerPodz,
  grouperParApplication,
  resumeLangues,
  SANS_APPLICATION,
  type FiltreEtat,
  type FormatPodz,
  type LignePodz,
} from "./identite";

const TH = cn(MICRO_LABEL, "px-3 py-2 text-left font-medium whitespace-nowrap");
const TD = "px-3 py-3 align-middle";
const NUM = "text-right tabular-nums whitespace-nowrap";
/** Les drapeaux montrés dans une ligne avant « +n ». */
const DRAPEAUX_MAX = 8;

function Langues({ ligne, ouvertures }: { ligne: LignePodz; ouvertures: OuvertureLangue[] }) {
  const { t } = useTranslation();
  if (ligne.format === "video") return <span className="text-muted-foreground">—</span>;
  const langues = etatLangues(ligne.pod.langues, ligne.fiche?.comptes_par_langue ?? {}, ouvertures.filter((o) => o.pod === ligne.pod.slug), ligne.pod.langues_pretes);
  const r = resumeLangues(langues);
  if (ligne.format === "texte_banque") {
    return (
      <div className="leading-tight">
        <div className="tabular-nums">{t("pods.liste.languesTraduit", { count: r.servie })}</div>
        <div className="text-xs text-muted-foreground">{t("pods.liste.traduitOs")}</div>
      </div>
    );
  }
  const dansListe = langues.filter((l) => l.etat !== "hors_liste");
  const alerte = langues.filter((l) => l.etat === "hors_liste" && l.comptes > 0).length;
  return (
    <div className="space-y-1 leading-tight">
      <div className="flex items-center gap-1 whitespace-nowrap text-base leading-none">
        {dansListe.slice(0, DRAPEAUX_MAX).map((l) => (
          <span
            key={l.langue}
            title={`${canoniserLangue(l.langue)} · ${t(`pods.langues.legende.${l.etat}`)}`}
            className={cn(l.etat !== "servie" && "opacity-30 grayscale")}
          >
            {drapeauLangue(canoniserLangue(l.langue))}
          </span>
        ))}
        {dansListe.length > DRAPEAUX_MAX && (
          <span className="text-xs text-muted-foreground">+{dansListe.length - DRAPEAUX_MAX}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {t("pods.liste.languesServies", { servies: r.servie, total: dansListe.length })}
        {r.a_preparer > 0 && <span className="text-info-foreground"> · {t("pods.liste.aPreparer", { count: r.a_preparer })}</span>}
        {alerte > 0 && <span className="text-destructive"> · {t("pods.liste.horsListe", { count: alerte })}</span>}
      </div>
    </div>
  );
}

function Ligne({ ligne, ouvertures, suite }: { ligne: LignePodz; ouvertures: OuvertureLangue[]; suite: boolean }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { pod, fiche, tableau } = ligne;
  const runway = tableau ? autonomieMin(tableau.autonomie) : null;
  const court = runway?.jours != null && runway.jours < SEUIL_STOCK_JOURS;
  const vues = tableau?.vues_moyenne ?? tableau?.vues_mediane ?? null;
  return (
    <tr className={cn("group border-t border-border/50 transition-colors hover:bg-muted/40", !pod.actif && "text-muted-foreground")}>
      <td className={cn(TD, "min-w-64")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Deux podz d'un même label : le nom du label n'est pas répété. */}
          <Link
            to={`/admin/pods/${pod.slug}`}
            className={cn("text-[15px] font-semibold underline-offset-2 hover:underline", suite && "text-muted-foreground")}
          >
            {ligne.titre}
          </Link>
          <EtiquetteFormat format={ligne.format} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {!pod.actif || fiche?.comptes === 0 ? <EtiquetteEtat actif={pod.actif} comptes={fiche?.comptes ?? null} /> : null}
          <span>
          {ligne.modeles.length > 0 ? (
            <>
              {t("pods.liste.modele")}{" "}
              {ligne.modeles.map((m, i) => (
                <React.Fragment key={m}>
                  {i > 0 && ", "}
                  <LienCompte handle={m} />
                </React.Fragment>
              ))}
            </>
          ) : (
            pod.nom
          )}
          </span>
        </div>
      </td>
      <td className={cn(TD, "min-w-44")}>
        <Langues ligne={ligne} ouvertures={ouvertures} />
      </td>
      <td className={cn(TD, NUM, fiche?.comptes === 0 && pod.actif && "font-semibold text-warning-foreground")}>{fiche ? fiche.comptes : "—"}</td>
      <td className={cn(TD, NUM)}>
        {vues == null ? "—" : abrege(vues, langue)}
        {tableau?.vues_moyenne != null && tableau.vues_mediane != null && (
          <div className="text-xs text-muted-foreground">{t("pods.tableau.mediane", { n: abrege(tableau.vues_mediane, langue) })}</div>
        )}
      </td>
      <td className={cn(TD, NUM)}>{tableau?.pct_10k == null ? "—" : `${tableau.pct_10k.toLocaleString(langue === "fr" ? "fr-FR" : "en-US")} %`}</td>
      <td className={cn(TD, NUM)}>{tableau ? tableau.publies_7j : "—"}</td>
      <td className={cn(TD, "min-w-32")}>
        {runway?.jours != null ? (
          <div className="flex items-center gap-2">
            <span className={cn("w-9 shrink-0 tabular-nums", court && "font-semibold text-destructive")}>
              {t("pods.runwayJours", { n: runway.jours.toLocaleString() })}
            </span>
            <div className="w-16">
              <BarreReserve jours={runway.jours} seuil={SEUIL_STOCK_JOURS} libelleSeuil={t("pods.runwayJours", { n: SEUIL_STOCK_JOURS })} />
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={cn(TD, NUM)}>
        {tableau && tableau.a_valider > 0 ? (
          <Link
            to="/admin/pods?vue=valider"
            className="inline-flex min-w-6 justify-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-foreground hover:bg-warning/25"
          >
            {tableau.a_valider}
          </Link>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="w-8 pr-3 text-right">
        <Link to={`/admin/pods/${pod.slug}`} aria-label={t("pods.liste.ouvrir", { nom: ligne.titre })} className="inline-flex text-muted-foreground group-hover:text-foreground">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

/** La liste des podz, avec ses deux filtres (format, état). */
export function ListePodz({ lignes, ouvertures }: { lignes: LignePodz[]; ouvertures: OuvertureLangue[] }) {
  const { t } = useTranslation();
  const [format, setFormat] = React.useState<FormatPodz | "tous">("tous");
  const [etat, setEtat] = React.useState<FiltreEtat>("actifs");
  const filtrees = filtrerPodz(lignes, { format, etat });
  const groupes = grouperParApplication(filtrees);
  const compte = (f: FormatPodz | "tous") => filtrerPodz(lignes, { format: f, etat }).length;
  const formats: (FormatPodz | "tous")[] = ["tous", "texte_banque", "images_finies", "video"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segments
          libelle={t("pods.liste.filtreFormat")}
          actif={format}
          onChange={setFormat}
          options={formats
            .filter((f) => f === "tous" || compte(f) > 0)
            .map((f) => ({
              cle: f,
              contenu: (
                <>
                  {f === "tous" ? t("pods.liste.tous") : t(`pods.format.${f}`)}
                  <span className="tabular-nums text-muted-foreground">{compte(f)}</span>
                </>
              ),
            }))}
        />
        <Segments
          libelle={t("pods.liste.filtreEtat")}
          actif={etat}
          onChange={setEtat}
          options={(["actifs", "pause", "tous"] as const).map((e) => ({ cle: e, contenu: t(`pods.liste.etat.${e}`) }))}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>{t("pods.liste.colPodz")}</th>
                <th className={TH}>{t("pods.liste.colLangues")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.liste.colComptes")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.tableau.vuesMoyenne")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.tableau.pct10k")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.tableau.publies7j")}</th>
                <th className={TH}>
                  <span className="inline-flex items-center gap-1">
                    {t("pods.liste.colReserve")}
                    <Aide libelle={t("pods.liste.colReserve")}>{t("pods.tableau.runwayAide")}</Aide>
                  </span>
                </th>
                <th className={cn(TH, "text-right")}>{t("pods.tableau.aValider")}</th>
                <th aria-hidden />
              </tr>
            </thead>
            {groupes.map((g) => (
              <tbody key={g.application}>
                <tr className="border-t bg-muted/40">
                  <th colSpan={9} scope="rowgroup" className="px-3 py-2 text-left font-normal">
                    <span className="flex items-center gap-2">
                      {g.application !== SANS_APPLICATION && <LogoApplication slug={g.application} taille="sm" decoratif />}
                      <span className="text-sm font-semibold">
                        {g.application === SANS_APPLICATION ? t("pods.liste.sansApplication") : nomAffiche(g.application)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("pods.liste.groupe", { podz: g.lignes.length, comptes: g.comptes })}
                      </span>
                    </span>
                  </th>
                </tr>
                {g.lignes.map((l, i) => (
                  <Ligne
                    key={l.pod.slug}
                    ligne={l}
                    ouvertures={ouvertures}
                    suite={i > 0 && Boolean(l.pod.label_id) && g.lignes[i - 1]!.pod.label_id === l.pod.label_id}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
        {filtrees.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("pods.liste.vide")}</p>}
      </Card>
    </div>
  );
}
