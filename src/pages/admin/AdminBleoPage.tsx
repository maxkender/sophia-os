import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Calculator, Check, ClipboardCheck, Gavel, GitBranch, History, Layers, Lock, MoonStar, Radar, RefreshCw, Shuffle, X } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { listerNuits, listerRuns, lireReglagesBleo, runOfficiel, type RapportPlan } from "@/features/bleo/api";
import { formaterJour, formaterNombre, formaterPart, formaterQuand, part, PORTES } from "@/features/bleo/format";
import { CarteSuivi } from "@/features/bleo/CarteSuivi";
import { InterrupteurMode } from "@/features/bleo/InterrupteurMode";
import { EnteteTableau, EtatRequete, EtiquetteIcone, Ligne, TD, TD_NUM, TH, TH_NUM, Tableau, TitreCarte } from "@/features/bleo/ui";

function Portes({ rapport }: { rapport: RapportPlan }) {
  const { t } = useTranslation();
  const portes = rapport.portes ?? {};
  return (
    <ul className="grid gap-1.5 text-sm">
      {PORTES.filter((p) => p in portes).map((p) => {
        const ok = portes[p] === true;
        return (
          <li key={p} className="flex items-center gap-2">
            {ok ? (
              <Check className="size-4 shrink-0 text-success" aria-label={t("bleo.ok")} />
            ) : (
              <X className="size-4 shrink-0 text-destructive" aria-label={t("bleo.pasOk")} />
            )}
            <span>{t(`bleo.portes.${p}`)}</span>
            {p === "part_juger_ok" && <span className="whitespace-nowrap text-muted-foreground">({formaterPart(Number(portes.part_juger))})</span>}
            {p === "non_gagnants_ok" && (
              <span className="whitespace-nowrap text-muted-foreground">({formaterPart(Number(portes.part_non_gagnants))})</span>
            )}
            {p === "recolte_ok" && <span className="whitespace-nowrap text-muted-foreground">({formaterPart(Number(portes.part_recolte))})</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * BLEO, vue d'ensemble : le mode, la dernière nuit, le dernier plan et son
 * rapport, puis l'historique des nuits et des plans. Seule écriture : l'interrupteur de mode (admin).
 */
export function AdminBleoPage() {
  const { t, i18n } = useTranslation();
  const reglages = useQuery({ queryKey: ["bleo", "reglages"], queryFn: lireReglagesBleo });
  const nuits = useQuery({ queryKey: ["bleo", "nuits"], queryFn: () => listerNuits(7) });
  const runs = useQuery({ queryKey: ["bleo", "runs"], queryFn: () => listerRuns(10) });

  const mode = typeof reglages.data?.mode === "string" ? reglages.data.mode : "off";
  const nuit = nuits.data?.[0];
  const plan = runs.data ? runOfficiel(runs.data) : null;
  const rapport = runs.data?.find((r) => r.resume?.rapport && !r.erreur)?.resume?.rapport ?? null;
  const resume = plan?.resume;
  const creneaux = resume?.creneaux;

  return (
    <div className="space-y-6" data-testid="page-bleo">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Radar className="size-6 text-muted-foreground" aria-hidden />
            {t("bleo.vue.titre")}
          </span>
        }
        description={t(`bleo.vue.description_${mode}`, { defaultValue: t("bleo.vue.description_ombre") })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={mode === "off" ? "secondary" : mode === "ombre" ? "info" : "success"} size="lg">
              {t("bleo.mode", { mode: t(`bleo.modes.${mode}`, { defaultValue: mode }) })}
            </Badge>
            {reglages.data && <InterrupteurMode mode={mode} plan={plan} />}
          </div>
        }
      />

      <EtatRequete erreur={reglages.error ?? nuits.error ?? runs.error} chargement={nuits.isLoading || runs.isLoading} />

      {plan && resume && (
        <Card>
          <CardHeader>
            <TitreCarte icone={Shuffle}>{t("bleo.vue.dernierPlan", { jour: formaterJour(plan.jour_vise, i18n.language) })}</TitreCarte>
            <CardDescription>
              {t("bleo.vue.dernierPlanDesc", { quand: formaterQuand(plan.fini_le, i18n.language), duree: formaterNombre(resume.duree_s, 1) })}{" "}
              <Link to="/admin/bleo/plan" className="underline">
                {t("bleo.vue.voirPlan")}
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatGroup>
              <StatTile
                label={t("bleo.stats.comptes")}
                value={resume.comptes ?? "—"}
                detail={t("bleo.stats.creneaux", { n: creneaux ?? 0, vides: resume.creneaux_vides ?? 0 })}
                tone={resume.creneaux_vides ? "alerte" : "neutre"}
              />
              <StatTile
                label={t("bleo.stats.fileJuger")}
                value={formaterPart(part(resume.par_file?.juger, creneaux))}
                detail={t("bleo.stats.fileJugerDetail", { n: resume.par_file?.juger ?? 0 })}
              />
              <StatTile
                label={t("bleo.stats.recolte")}
                value={formaterPart(part(resume.par_categorie?.recolte, creneaux))}
                detail={t("bleo.stats.recolteDetail", { n: resume.par_categorie?.recolte ?? 0 })}
              />
              <StatTile
                label={t("bleo.stats.nonGagnants")}
                value={formaterPart(
                  part((resume.par_categorie?.non_gagnant_neuve ?? 0) + (resume.par_categorie?.non_gagnant_servie ?? 0), creneaux),
                )}
                detail={t("bleo.stats.nonGagnantsDetail")}
              />
            </StatGroup>
          </CardContent>
        </Card>
      )}

      <CarteSuivi />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <TitreCarte icone={ClipboardCheck}>{t("bleo.vue.rapport")}</TitreCarte>
            <CardDescription>
              {rapport
                ? t("bleo.vue.rapportDesc", { jour: formaterJour(rapport.jour, i18n.language), quand: formaterQuand(rapport.calcule_le, i18n.language) })
                : t("bleo.vue.rapportAucun")}
            </CardDescription>
          </CardHeader>
          {rapport && (
            <CardContent className="space-y-3">
              <Portes rapport={rapport} />
              <p className="text-xs text-muted-foreground">
                {t("bleo.vue.rapportValeur", {
                  plan: formaterNombre(rapport.valeur_plan, 0),
                  reel: formaterNombre(rapport.valeur_reel, 0),
                  identiques: rapport.couples_identiques ?? 0,
                })}
              </p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <TitreCarte icone={MoonStar}>{t("bleo.vue.derniereNuit")}</TitreCarte>
            <CardDescription>
              {nuit
                ? t("bleo.vue.derniereNuitDesc", {
                    jour: formaterJour(nuit.jour, i18n.language),
                    quand: formaterQuand(nuit.fini_le, i18n.language),
                    duree: formaterNombre(nuit.resume?.duree_s, 1),
                  })
                : t("bleo.vue.nuitAucune")}
            </CardDescription>
          </CardHeader>
          {nuit?.resume && (
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <EtiquetteIcone icone={Calculator}>{t("bleo.nuit.rCalcules")}</EtiquetteIcone>
                <dd className="tabular-nums">{nuit.resume.r_calcules ?? "—"}</dd>
                <EtiquetteIcone icone={Gavel}>{t("bleo.nuit.juges")}</EtiquetteIcone>
                <dd className="tabular-nums">{nuit.resume.juges ?? "—"}</dd>
                <EtiquetteIcone icone={RefreshCw}>{t("bleo.nuit.verdictsChanges")}</EtiquetteIcone>
                <dd className="tabular-nums">{nuit.resume.contenus_verdict_change ?? "—"}</dd>
                <EtiquetteIcone icone={Lock}>{t("bleo.nuit.famillesCloses")}</EtiquetteIcone>
                <dd className="tabular-nums">{nuit.resume.familles_closes ?? "—"}</dd>
                <EtiquetteIcone icone={GitBranch}>{t("bleo.nuit.familles")}</EtiquetteIcone>
                <dd className="tabular-nums">
                  {t("bleo.nuit.famillesDetail", {
                    g: nuit.resume.verdicts_familles?.gagnante ?? 0,
                    a: nuit.resume.verdicts_familles?.en_attente ?? 0,
                    n: nuit.resume.verdicts_familles?.non_gagnante ?? 0,
                  })}
                </dd>
                <EtiquetteIcone icone={Layers}>{t("bleo.nuit.contenus")}</EtiquetteIcone>
                <dd className="tabular-nums">
                  {t("bleo.nuit.contenusDetail", {
                    j: nuit.resume.etats?.juge ?? 0,
                    t: nuit.resume.etats?.en_test ?? 0,
                    a: nuit.resume.etats?.a_juger ?? 0,
                  })}
                </dd>
              </dl>
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <TitreCarte icone={History}>{t("bleo.vue.historique")}</TitreCarte>
          <CardDescription>{t("bleo.vue.historiqueDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tableau minWidth="44rem">
            <EnteteTableau>
              <th className={TH}>{t("bleo.colonnes.jourVise")}</th>
              <th className={TH}>{t("bleo.colonnes.tire")}</th>
              <th className={TH_NUM}>{t("bleo.stats.comptes")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.vides")}</th>
              <th className={TH_NUM}>{t("bleo.stats.fileJuger")}</th>
              <th className={TH_NUM}>{t("bleo.stats.recolte")}</th>
              <th className={TH}>{t("bleo.colonnes.statut")}</th>
            </EnteteTableau>
            <tbody>
              {(runs.data ?? []).map((r) => (
                <Ligne key={r.id} className={r.erreur ? "text-muted-foreground" : undefined}>
                  <td className={TD}>
                    <Link to={`/admin/bleo/plan?run=${r.id}`} className="underline-offset-2 hover:underline">
                      {formaterJour(r.jour_vise, i18n.language)}
                    </Link>
                  </td>
                  <td className={TD}>{formaterQuand(r.demarre_le, i18n.language)}</td>
                  <td className={TD_NUM}>{r.resume?.comptes ?? "—"}</td>
                  <td className={TD_NUM}>{r.resume?.creneaux_vides ?? "—"}</td>
                  <td className={TD_NUM}>{formaterPart(part(r.resume?.par_file?.juger, r.resume?.creneaux))}</td>
                  <td className={TD_NUM}>{formaterPart(part(r.resume?.par_categorie?.recolte, r.resume?.creneaux))}</td>
                  <td className={TD}>
                    {r.erreur ? (
                      <span title={r.erreur}>{t("bleo.vue.essai")}</span>
                    ) : r.fini_le ? (
                      r.resume?.rapport ? t("bleo.vue.avecRapport") : t("bleo.vue.fini")
                    ) : (
                      t("bleo.vue.enCours")
                    )}
                  </td>
                </Ligne>
              ))}
            </tbody>
          </Tableau>
        </CardContent>
      </Card>
    </div>
  );
}
