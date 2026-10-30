import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ListChecks, Megaphone, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";

import { lireAvancementCta } from "./api";
import { FORMES_CTA, SLIDE_CTA_MIN } from "./formesCta";
import { messageErreur } from "./messageErreur";
import { MiniBarre, TuileIcone } from "./Puces";

const CLE_REQUETE_AVANCEMENT = ["cta-avancement"] as const;

/**
 * Le CTA mesurable (étape 4, docs/cta.md) : la liste fixe des formes et le
 * classement des CTA publiés. Les fiches label du lundi (poids du tirage) sont
 * dans la page Fiches. Rien ici ne change un post : le tirage s'en servira à
 * l'étape 5.
 */
export function SectionCta() {
  const { t } = useTranslation();
  const avancement = useQuery({
    queryKey: CLE_REQUETE_AVANCEMENT,
    queryFn: lireAvancementCta,
    refetchInterval: (q) => ((q.state.data?.a_classer ?? 0) > 0 ? 30_000 : false),
  });
  const classes = avancement.data?.classes ?? 0;
  const reste = avancement.data?.a_classer ?? 0;
  const erreur = avancement.error;

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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{t("relectureNative.cta.fichesAide")}</p>
            <Button size="sm" variant="outline" render={<Link to="/admin/fiches?sorte=label" />}>
              <Tags />
              {t("relectureNative.cta.voirFichesLabel")}
            </Button>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
