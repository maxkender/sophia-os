import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import {
  listerFamilles,
  listerLabelsBleo,
  TAILLE_PAGE,
  type FiltreVerdict,
  type TriFamilles,
} from "@/features/bleo/api";
import { formaterJour, formaterNombre, formaterVues } from "@/features/bleo/format";
import {
  BadgeVerdict,
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

const VERDICTS: FiltreVerdict[] = ["toutes", "gagnante", "en_attente", "non_gagnante", "closes"];
const TRIS: TriFamilles[] = ["vues", "verdict", "passages", "recentes"];

/**
 * BLEO, familles d'accroche : toutes les familles (une accroche normalisée par
 * label, avec ses déclinaisons), filtrables par label, verdict et texte.
 * Les filtres vivent dans l'URL pour qu'un lien les garde.
 */
export function AdminBleoFamillesPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const labelId = params.get("label") ?? "";
  const verdict = (params.get("verdict") as FiltreVerdict | null) ?? "toutes";
  const tri = (params.get("tri") as TriFamilles | null) ?? "vues";
  const recherche = params.get("q") ?? "";
  const page = Number(params.get("page") ?? 0) || 0;
  const [saisie, setSaisie] = React.useState(recherche);

  const changer = (cle: string, valeur: string) => {
    const suivant = new URLSearchParams(params);
    if (valeur) suivant.set(cle, valeur);
    else suivant.delete(cle);
    if (cle !== "page") suivant.delete("page");
    setParams(suivant, { replace: true });
  };

  const labels = useQuery({ queryKey: ["bleo", "labels"], queryFn: listerLabelsBleo });
  const familles = useQuery({
    queryKey: ["bleo", "familles", labelId, verdict, tri, recherche, page],
    queryFn: () => listerFamilles({ labelId: labelId || undefined, verdict, tri, recherche, page }),
    placeholderData: keepPreviousData,
  });
  const total = familles.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  return (
    <div className="space-y-6" data-testid="page-bleo-familles">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GitBranch className="size-6 text-muted-foreground" aria-hidden />
            {t("bleo.familles.titre")}
          </span>
        }
        description={t("bleo.familles.description")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Segments<FiltreVerdict>
          libelle={t("bleo.colonnes.verdict")}
          actif={verdict}
          onChange={(v) => changer("verdict", v === "toutes" ? "" : v)}
          options={VERDICTS.map((v) => ({ cle: v, contenu: t(`bleo.familles.filtres.${v}`) }))}
        />
        <select
          aria-label={t("bleo.colonnes.label")}
          className={selectClass}
          value={labelId}
          onChange={(e) => changer("label", e.target.value)}
        >
          <option value="">{t("bleo.tousLabels")}</option>
          {(labels.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
              {l.voie === 2 ? ` · ${t("bleo.voie2")}` : ""}
            </option>
          ))}
        </select>
        <select
          aria-label={t("bleo.familles.tri")}
          className={selectClass}
          value={tri}
          onChange={(e) => changer("tri", e.target.value === "vues" ? "" : e.target.value)}
        >
          {TRIS.map((v) => (
            <option key={v} value={v}>
              {t(`bleo.familles.tris.${v}`)}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changer("q", saisie.trim());
          }}
        >
          <Input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={t("bleo.familles.chercher")}
            className="h-8 w-64"
          />
        </form>
        <span className="ml-auto text-xs text-muted-foreground">{t("bleo.familles.total", { n: total })}</span>
      </div>

      <EtatRequete erreur={familles.error ?? labels.error} chargement={familles.isLoading} />

      <Card>
        <CardContent className="pt-4">
          <Tableau minWidth="56rem">
            <EnteteTableau>
              <th className={TH}>{t("bleo.colonnes.accroche")}</th>
              <th className={TH}>{t("bleo.colonnes.label")}</th>
              <th className={TH}>{t("bleo.colonnes.verdict")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.contenus")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.passages")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.vuesMax")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.rMedian")}</th>
              <th className={TH}>{t("bleo.colonnes.dernierPassage")}</th>
            </EnteteTableau>
            <tbody>
              {(familles.data?.familles ?? []).map((f) => (
                <Ligne key={f.id}>
                  <td className={`${TD} max-w-[26rem]`}>
                    <Link to={`/admin/bleo/familles/${f.id}`} className="line-clamp-2 underline-offset-2 hover:underline">
                      {f.accroche ?? f.racine_titre ?? "—"}
                    </Link>
                  </td>
                  <td className={TD}>{f.label_nom ?? "—"}</td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-1">
                      <BadgeVerdict verdict={f.verdict} />
                      {f.close && <Badge variant="outline">{t("bleo.close")}</Badge>}
                    </span>
                  </td>
                  <td className={TD_NUM}>
                    {f.n_contenus}
                    {f.gen_max > 0 && <span className="ml-1 text-muted-foreground">G{f.gen_max}</span>}
                  </td>
                  <td className={TD_NUM}>{f.n_passages}</td>
                  <td className={TD_NUM}>{formaterVues(f.vues_max, i18n.language)}</td>
                  <td className={TD_NUM}>{formaterNombre(f.r_median, 2)}</td>
                  <td className={TD}>{formaterJour(f.dernier_passage?.slice(0, 10), i18n.language)}</td>
                </Ligne>
              ))}
            </tbody>
          </Tableau>
          {familles.data && familles.data.familles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</p>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="outline" size="xs" disabled={page === 0} onClick={() => changer("page", String(page - 1))}>
            {t("bleo.precedent")}
          </Button>
          <span className="tabular-nums">{t("bleo.page", { page: page + 1, pages })}</span>
          <Button variant="outline" size="xs" disabled={page + 1 >= pages} onClick={() => changer("page", String(page + 1))}>
            {t("bleo.suivant")}
          </Button>
        </div>
      )}
    </div>
  );
}
