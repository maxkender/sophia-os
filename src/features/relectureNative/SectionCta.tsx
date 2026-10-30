import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Calculator, History, ListChecks, Loader2, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";

import { calculerFichesLabel, lireAvancementCta, listerFichesLabel } from "./api";
import { FORMES_CTA, SLIDE_CTA_MIN } from "./formesCta";
import { messageErreur } from "./messageErreur";
import { MiniBarre, TuileIcone } from "./Puces";

const CLE_REQUETE_FICHES_LABEL = ["fiches-label"] as const;
const CLE_REQUETE_AVANCEMENT = ["cta-avancement"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Le CTA mesurable (étape 4, docs/cta.md) : la liste fixe des formes, le
 * classement des CTA publiés et les fiches label du lundi (poids du tirage).
 * Rien ici ne change un post : le tirage s'en servira à l'étape 5.
 */
export function SectionCta() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const fiches = useQuery({ queryKey: CLE_REQUETE_FICHES_LABEL, queryFn: listerFichesLabel });
  const avancement = useQuery({
    queryKey: CLE_REQUETE_AVANCEMENT,
    queryFn: lireAvancementCta,
    refetchInterval: (q) => ((q.state.data?.a_classer ?? 0) > 0 ? 30_000 : false),
  });
  const [label, setLabel] = React.useState("");
  const calculer = useMutation({
    mutationFn: calculerFichesLabel,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_FICHES_LABEL }),
  });

  const liste = fiches.data ?? [];
  const choisie = liste.find((f) => f.cle === label) ?? liste[0] ?? null;
  const classes = avancement.data?.classes ?? 0;
  const reste = avancement.data?.a_classer ?? 0;
  const erreur = fiches.error ?? avancement.error;

  return (
    <div className="space-y-4" data-testid="cta">
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}

      <Card>
        <CardPanel className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <TuileIcone icone={Megaphone} ton="violet" />
            <div className="min-w-[14rem] flex-1 space-y-1">
              <h2 className="text-base font-semibold">{t("relectureNative.cta.titre")}</h2>
              <p className="text-sm text-muted-foreground">{t("relectureNative.cta.aide")}</p>
            </div>
          </div>
          <p className="rounded-lg border bg-muted/30 p-3 text-sm">{t("relectureNative.cta.regleSlide", { n: SLIDE_CTA_MIN })}</p>
          <ol className="grid gap-3 sm:grid-cols-2" aria-label={t("relectureNative.cta.titre")}>
            {FORMES_CTA.map((f, i) => (
              <li key={f.code} className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {i + 1}. {f.nom}
                </p>
                <p className="text-xs text-muted-foreground">{f.definition}</p>
                <p className="text-xs italic text-muted-foreground">{f.exemple}</p>
              </li>
            ))}
          </ol>
        </CardPanel>
      </Card>

      <Card>
        <CardPanel className="space-y-5">
          <div className="space-y-1.5" data-testid="cta-avancement">
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-muted-foreground" aria-hidden />
              <p className={MICRO_LABEL}>{t("relectureNative.cta.classement")}</p>
            </div>
            <p className="text-sm font-medium">
              {avancement.isPending ? t("common.loading") : t("relectureNative.cta.avancement", { classes, reste })}
            </p>
            <MiniBarre valeur={classes} total={classes + reste} ton="bleu" />
            <p className="text-xs text-muted-foreground">{t("relectureNative.cta.avancementAide")}</p>
          </div>

          <div className="space-y-3" data-testid="fiches-label">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1 space-y-1">
                <p className={MICRO_LABEL}>{t("relectureNative.cta.fiches")}</p>
                <p className="text-xs text-muted-foreground">{t("relectureNative.cta.fichesAide")}</p>
              </div>
              {liste.length > 0 && (
                <label className="flex w-full flex-col gap-1 text-xs sm:w-56">
                  <span className="text-muted-foreground">{t("relectureNative.cta.label")}</span>
                  <select className={selectClass} value={choisie?.cle ?? ""} onChange={(e) => setLabel(e.target.value)}>
                    {liste.map((f) => (
                      <option key={f.cle} value={f.cle}>
                        {f.cle}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button variant="outline" disabled={calculer.isPending} onClick={() => calculer.mutate()}>
                {calculer.isPending ? <Loader2 className="animate-spin" /> : <Calculator />}
                {t("relectureNative.cta.calculer")}
              </Button>
            </div>
            {calculer.data && (
              <p className="text-xs text-success-foreground">
                {t("relectureNative.cta.calcule", { fiches: calculer.data.fiches, lignes: calculer.data.lignes })}
              </p>
            )}
            {calculer.error && (
              <p role="alert" className="text-xs text-destructive">
                {messageErreur(calculer.error)}
              </p>
            )}
            {fiches.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : choisie ? (
              <div className="space-y-1.5" data-testid={`fiche-label-${choisie.cle}`}>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <History className="size-3.5" aria-hidden />
                  {t("relectureNative.cta.version", {
                    version: choisie.version,
                    date: new Date(choisie.created_at).toLocaleString(i18n.language),
                  })}
                </p>
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs">
                  {choisie.contenu}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("relectureNative.cta.aucuneFiche")}</p>
            )}
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
