import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Shuffle } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { listerLabelsBleo, listerPlan, listerRuns, runOfficiel, TAILLE_PAGE } from "@/features/bleo/api";
import { CATEGORIES_PLAN, formaterJour, formaterNombre, formaterPart, formaterQuand, part } from "@/features/bleo/format";
import {
  BadgeCategorie,
  EnteteTableau,
  EtatRequete,
  Ligne,
  selectClass,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
  Tableau,
} from "@/features/bleo/ui";
import { nomLangue } from "@/features/moteur/langues";

const PAR_PAGE = TAILLE_PAGE * 2;

/**
 * BLEO, plan du jour : ce que le tirage de 14 h aurait donné à chaque compte
 * pour J+1 (mode ombre, rien n'est publié), à côté de ce que minuit a
 * réellement assigné. Un tirage se choisit dans la liste (`?run=`).
 */
export function AdminBleoPlanPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const runs = useQuery({ queryKey: ["bleo", "runs", 30], queryFn: () => listerRuns(30) });
  const labelsOs = useQuery({ queryKey: ["bleo", "labels"], queryFn: listerLabelsBleo });
  const runId = params.get("run") ?? (runs.data ? runOfficiel(runs.data)?.id : undefined) ?? undefined;
  const run = runs.data?.find((r) => r.id === runId);
  const categorie = params.get("categorie") ?? "";
  const label = params.get("label") ?? "";
  const [compte, setCompte] = React.useState(params.get("compte") ?? "");
  const page = Number(params.get("page") ?? 0) || 0;

  const changer = (cle: string, valeur: string) => {
    const suivant = new URLSearchParams(params);
    if (valeur) suivant.set(cle, valeur);
    else suivant.delete(cle);
    if (cle !== "page") suivant.delete("page");
    setParams(suivant, { replace: true });
  };

  const plan = useQuery({
    queryKey: ["bleo", "plan", runId, categorie, label, params.get("compte") ?? "", page],
    queryFn: () => listerPlan(runId!, { categorie, label, compte: params.get("compte") ?? "", page }),
    enabled: Boolean(runId),
    placeholderData: keepPreviousData,
  });

  const resume = run?.resume;
  const creneaux = resume?.creneaux;
  const labels = Object.keys(resume?.labels_file_juger ?? {}).sort();
  const total = plan.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <div className="space-y-6" data-testid="page-bleo-plan">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Shuffle className="size-6 text-muted-foreground" aria-hidden />
            {t("bleo.plan.titre")}
          </span>
        }
        description={t("bleo.plan.description")}
        actions={
          <select
            aria-label={t("bleo.plan.tirage")}
            className={selectClass}
            value={runId ?? ""}
            onChange={(e) => setParams(e.target.value ? { run: e.target.value } : {}, { replace: true })}
          >
            {(runs.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {t("bleo.plan.option", {
                  jour: formaterJour(r.jour_vise, i18n.language),
                  quand: formaterQuand(r.demarre_le, i18n.language),
                })}
                {r.erreur ? ` · ${t("bleo.vue.essai")}` : ""}
              </option>
            ))}
          </select>
        }
      />

      <EtatRequete erreur={runs.error ?? plan.error} chargement={runs.isLoading} />
      {runs.data && !run && <p className="text-sm text-muted-foreground">{t("bleo.plan.aucun")}</p>}
      {run?.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-sm">{t("bleo.plan.essai", { erreur: run.erreur })}</p>
      )}

      {resume && (
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
            detail={t("bleo.plan.tests", {
              places: resume.tests_places ?? 0,
              recents: resume.testables_recents_complets ?? 0,
              total: resume.testables_recents ?? 0,
            })}
          />
          <StatTile
            label={t("bleo.stats.recolte")}
            value={formaterPart(part(resume.par_categorie?.recolte, creneaux))}
            detail={t("bleo.stats.recolteDetail", { n: resume.par_categorie?.recolte ?? 0 })}
          />
          <StatTile
            label={t("bleo.plan.duree")}
            value={formaterNombre(resume.duree_s, 1)}
            unit="s"
            detail={Object.entries(resume.par_appli ?? {})
              .map(([a, n]) => `${a} ${n}`)
              .join(" · ")}
          />
        </StatGroup>
      )}

      {resume && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("bleo.plan.melange")}</CardTitle>
              <CardDescription>{t("bleo.plan.melangeDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tableau minWidth="20rem">
                <EnteteTableau>
                  <th className={TH}>{t("bleo.colonnes.categorie")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.passages")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.part")}</th>
                </EnteteTableau>
                <tbody>
                  {CATEGORIES_PLAN.filter((c) => resume.par_categorie?.[c] != null).map((c) => (
                    <Ligne key={c}>
                      <td className={TD}>
                        <button type="button" className="hover:underline" onClick={() => changer("categorie", c)}>
                          <BadgeCategorie categorie={c} />
                        </button>
                      </td>
                      <td className={TD_NUM}>{resume.par_categorie?.[c]}</td>
                      <td className={TD_NUM}>{formaterPart(part(resume.par_categorie?.[c], creneaux))}</td>
                    </Ligne>
                  ))}
                </tbody>
              </Tableau>
              {resume.relaches && Object.keys(resume.relaches).length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("bleo.plan.relaches")}{" "}
                  {Object.entries(resume.relaches)
                    .map(([k, n]) => `${t(`bleo.relaches.${k}`, { defaultValue: k })} ${n}`)
                    .join(" · ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("bleo.plan.capacite")}</CardTitle>
              <CardDescription>{t("bleo.plan.capaciteDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tableau minWidth="20rem">
                <EnteteTableau>
                  <th className={TH}>{t("bleo.colonnes.label")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.tests")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.capacite")}</th>
                </EnteteTableau>
                <tbody>
                  {labels.map((l) => {
                    const c = resume.labels_file_juger![l];
                    return (
                      <Ligne key={l}>
                        <td className={TD}>{l}</td>
                        <td className={TD_NUM}>{c.utilise}</td>
                        <td className={TD_NUM}>{c.capacite}</td>
                      </Ligne>
                    );
                  })}
                </tbody>
              </Tableau>
            </CardContent>
          </Card>
        </div>
      )}

      {runId && (
        <Card>
          <CardHeader>
            <CardTitle>{t("bleo.plan.parCompte")}</CardTitle>
            <CardDescription>{t("bleo.plan.parCompteDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t("bleo.colonnes.categorie")}
                className={selectClass}
                value={categorie}
                onChange={(e) => changer("categorie", e.target.value)}
              >
                <option value="">{t("bleo.plan.toutesCategories")}</option>
                {CATEGORIES_PLAN.map((c) => (
                  <option key={c} value={c}>
                    {t(`bleo.categories.${c}`)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("bleo.colonnes.label")}
                className={selectClass}
                value={label}
                onChange={(e) => changer("label", e.target.value)}
              >
                <option value="">{t("bleo.tousLabels")}</option>
                {(labelsOs.data ?? []).map((l) => (
                  <option key={l.id} value={l.slug}>
                    {l.nom}
                  </option>
                ))}
              </select>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  changer("compte", compte.trim());
                }}
              >
                <Input
                  value={compte}
                  onChange={(e) => setCompte(e.target.value)}
                  placeholder={t("bleo.plan.chercherCompte")}
                  className="h-8 w-48"
                />
              </form>
              <span className="ml-auto text-xs text-muted-foreground">{t("bleo.lignes", { n: total })}</span>
            </div>

            <Tableau minWidth="60rem">
              <EnteteTableau>
                <th className={TH}>{t("bleo.colonnes.compte")}</th>
                <th className={TH_NUM}>#</th>
                <th className={TH}>{t("bleo.colonnes.categorie")}</th>
                <th className={TH}>{t("bleo.colonnes.accroche")}</th>
                <th className={TH}>{t("bleo.colonnes.label")}</th>
                <th className={TH}>{t("bleo.colonnes.langue")}</th>
                <th className={TH}>{t("bleo.colonnes.appli")}</th>
                <th className={TH_NUM}>{t("bleo.colonnes.valeur")}</th>
                <th className={TH}>{t("bleo.colonnes.minuit")}</th>
              </EnteteTableau>
              <tbody>
                {(plan.data?.lignes ?? []).map((l) => (
                  <Ligne key={l.id}>
                    <td className={TD}>
                      <Link to={`/admin/createurs/${l.compte_id}`} className="underline-offset-2 hover:underline">
                        @{l.handle_tiktok ?? "?"}
                      </Link>
                    </td>
                    <td className={TD_NUM}>{l.creneau}</td>
                    <td className={TD}>
                      <BadgeCategorie categorie={l.categorie} />
                      {l.relache && (
                        <span className="ml-1 text-[10px] text-muted-foreground" title={t("bleo.plan.relacheAide")}>
                          {t(`bleo.relaches.${l.relache}`, { defaultValue: l.relache })}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} max-w-[22rem]`}>
                      {l.famille_id ? (
                        <Link to={`/admin/bleo/familles/${l.famille_id}`} className="line-clamp-2 underline-offset-2 hover:underline">
                          {l.accroche ?? l.titre}
                        </Link>
                      ) : (
                        <span className="line-clamp-2">{l.accroche ?? l.titre ?? "—"}</span>
                      )}
                    </td>
                    <td className={TD}>{l.label ?? "—"}</td>
                    <td className={TD}>{nomLangue(l.langue)}</td>
                    <td className={TD}>{l.application ?? "—"}</td>
                    <td className={TD_NUM}>{formaterNombre(l.valeur_tirage, 2)}</td>
                    <td className={`${TD} max-w-[18rem] text-muted-foreground`}>
                      {l.identique_au_reel ? (
                        <span className="font-medium text-success">{t("bleo.plan.identique")}</span>
                      ) : (
                        <span className="line-clamp-2" title={l.reel_titres ?? undefined}>
                          {l.reel_titres ?? t("bleo.plan.pasEncore")}
                        </span>
                      )}
                    </td>
                  </Ligne>
                ))}
              </tbody>
            </Tableau>

            {pages > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs">
                <Button variant="outline" size="xs" disabled={page === 0} onClick={() => changer("page", String(page - 1))}>
                  {t("bleo.precedent")}
                </Button>
                <span className="tabular-nums">{t("bleo.page", { page: page + 1, pages })}</span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page + 1 >= pages}
                  onClick={() => changer("page", String(page + 1))}
                >
                  {t("bleo.suivant")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
