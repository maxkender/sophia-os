import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CircleAlert, Copy, Gauge, Package, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { listerBoite, listerJauge, lireReglagesBleo } from "./api";
import { formaterJour, formaterNombre, formaterPart } from "./format";
import { EnteteTableau, EtatRequete, Ligne, TD, TD_NUM, TH, TH_NUM, Tableau, TitreCarte } from "./ui";

/**
 * BLEO, sur la page Pods sous le tableau de bord : la jauge de chaque podz de la voie 1
 * (semaines de boîte, part de full test du jour) et sa boîte, c'est-à-dire les
 * déclinaisons qu'il peut faire, dans l'ordre (2ᵉ génération d'abord, puis les
 * familles jamais déclinées). Les podz ne lisent pas encore la boîte (lot L4).
 * Le podz choisi est dans l'URL (`?boite=<label>`).
 */
export function SectionBoitePodz() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const jauge = useQuery({ queryKey: ["bleo", "jauge"], queryFn: listerJauge });
  const reglages = useQuery({ queryKey: ["bleo", "reglages"], queryFn: lireReglagesBleo });
  const labelId = params.get("boite") ?? jauge.data?.[0]?.label_id ?? "";
  const pod = jauge.data?.find((j) => j.label_id === labelId);
  const boite = useQuery({
    queryKey: ["bleo", "boite", labelId],
    queryFn: () => listerBoite(labelId),
    enabled: Boolean(labelId),
  });
  const maxParParent = Number((reglages.data?.boite as { declinaisons_par_parent?: number } | undefined)?.declinaisons_par_parent ?? 3);

  const choisir = (id: string) => {
    const suivant = new URLSearchParams(params);
    suivant.set("boite", id);
    setParams(suivant, { replace: true });
  };

  return (
    <section id="boite-podz" className="scroll-mt-20 space-y-6" data-testid="section-bleo-boite">
      <div className="space-y-2 border-t pt-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Package className="size-5 text-muted-foreground" aria-hidden />
          {t("bleo.podz.titre")}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("bleo.podz.description")}</p>
      </div>

      <EtatRequete erreur={jauge.error ?? boite.error ?? reglages.error} chargement={jauge.isLoading} />

      <Card>
        <CardHeader>
          <TitreCarte icone={Gauge}>{t("bleo.podz.jauge")}</TitreCarte>
          <CardDescription>{t("bleo.podz.jaugeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tableau minWidth="36rem">
            <EnteteTableau>
              <th className={TH}>{t("bleo.colonnes.podz")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.famillesEnBoite")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.parJour")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.semaines")}</th>
              <th className={TH_NUM}>{t("bleo.colonnes.fullTest")}</th>
            </EnteteTableau>
            <tbody>
              {(jauge.data ?? []).map((j) => (
                <Ligne key={j.pod} className={cn(j.label_id === labelId && "bg-muted/50")}>
                  <td className={TD}>
                    <button
                      type="button"
                      className="font-medium underline-offset-2 hover:underline"
                      aria-pressed={j.label_id === labelId}
                      onClick={() => choisir(j.label_id)}
                    >
                      {j.pod.replace(/^originaux_/, "")}
                    </button>
                  </td>
                  <td className={TD_NUM}>{j.familles_en_boite}</td>
                  <td className={TD_NUM}>{formaterNombre(j.par_jour, 1)}</td>
                  <td className={cn(TD_NUM, j.semaines != null && j.semaines < 3 && "font-medium text-destructive")}>
                    {formaterNombre(j.semaines, 1)}
                  </td>
                  <td className={TD_NUM}>{formaterPart(j.part_full_test)}</td>
                </Ligne>
              ))}
            </tbody>
          </Tableau>
        </CardContent>
      </Card>

      {pod && (
        <Card>
          <CardHeader>
            <TitreCarte icone={Package}>{t("bleo.podz.boite", { pod: pod.pod.replace(/^originaux_/, "") })}</TitreCarte>
            <CardDescription>
              {t("bleo.podz.boiteDesc", { max: maxParParent })}{" "}
              <Link to={`/admin/bleo/familles?label=${pod.label_id}&verdict=gagnante`} className="underline">
                {t("bleo.podz.voirFamilles")}
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tableau minWidth="50rem">
              <EnteteTableau>
                <th className={TH_NUM}>{t("bleo.colonnes.rang")}</th>
                <th className={TH}>{t("bleo.colonnes.declinaison")}</th>
                <th className={TH}>{t("bleo.colonnes.accroche")}</th>
                <th className={TH_NUM}>{t("bleo.colonnes.faites")}</th>
                <th className={TH}>{t("bleo.colonnes.gagnanteLe")}</th>
                <th className={TH}>{t("bleo.colonnes.budget")}</th>
              </EnteteTableau>
              <tbody>
                {(boite.data ?? []).map((b) => (
                  <Ligne key={`${b.famille_id}:${b.parent_contenu_id}`}>
                    <td className={TD_NUM}>{b.rang}</td>
                    <td className={TD}>
                      <Badge variant={b.sorte === "g2" ? "success" : "outline"}>
                        {b.sorte === "g2" ? <Sparkles aria-hidden /> : <Copy aria-hidden />}
                        {t(`bleo.podz.sortes.${b.sorte}`)}
                      </Badge>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {t(`bleo.podz.accroches.${b.accroche_attendue}`)}
                      </span>
                    </td>
                    <td className={`${TD} max-w-[28rem]`}>
                      <Link to={`/admin/bleo/familles/${b.famille_id}`} className="line-clamp-2 underline-offset-2 hover:underline">
                        {b.accroche ?? "—"}
                      </Link>
                    </td>
                    <td className={TD_NUM}>
                      {b.faites}/{maxParParent}
                    </td>
                    <td className={TD}>{formaterJour(b.verdict_le?.slice(0, 10), i18n.language)}</td>
                    <td className={TD}>
                      {b.au_budget ? (
                        <Badge variant="warning" title={t("bleo.podz.auBudgetAide")}>
                          <CircleAlert aria-hidden />
                          {t("bleo.podz.auBudget")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{t("bleo.podz.libre")}</span>
                      )}
                    </td>
                  </Ligne>
                ))}
              </tbody>
            </Tableau>
            {boite.data && boite.data.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("bleo.podz.boiteVide")}</p>
            )}
            {boite.data && boite.data.length >= 200 && (
              <p className="pt-3 text-xs text-muted-foreground">{t("bleo.podz.premiers", { n: 200 })}</p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">{t("bleo.podz.voie2")}</p>
    </section>
  );
}
