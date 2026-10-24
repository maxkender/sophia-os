import * as React from "react";
import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import { Aide } from "./graphes";
import type { ApplicationCandidate } from "./scoreApplication";
import { lignesPodz, type LignePod } from "./podz";
import type { ReglagesChoixLabel, StatLabel } from "./scoreLabel";

/**
 * Les labels 100 % podz sur la page Allocation (0352, 0353).
 *
 * Leur contenu vient tout entier d'un pod, qui produit pour leurs comptes :
 * la réserve ne les juge pas. Le moteur les teste sur quelques comptes, puis
 * les remplit langue par langue. Cette carte montre où on en est, LANGUE PAR
 * LANGUE : combien de comptes dans chaque langue livrée, et lesquelles peuvent
 * prendre le prochain compte (les autres attendent que le reste rattrape).
 *
 * Une langue « peut prendre » quand le moteur ne la met pas en attente : ses
 * comptes ne dépassent pas `niveau_pod`, le moins rempli des AUTRES langues
 * servies où l'application recrute. Même règle que `enAvanceRemplissage`.
 */

function Points({ n, max }: { n: number; max: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn("size-2.5 rounded-full border", i < n ? "border-foreground bg-foreground" : "border-muted-foreground/50")}
        />
      ))}
    </span>
  );
}

function Phase({ ligne, reglages }: { ligne: LignePod; reglages: ReglagesChoixLabel }) {
  const { t } = useTranslation();
  if (!ligne.enTest) {
    return (
      <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        {t("repartition.podzPhaseLangues")}
      </span>
    );
  }
  const plein = ligne.comptesTotal >= reglages.testPodComptes;
  return (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      {plein ? t("repartition.podzPhaseComplet") : t("repartition.podzPhaseTest")}
    </span>
  );
}

function Pod({ ligne, reglages }: { ligne: LignePod; reglages: ReglagesChoixLabel }) {
  const { t } = useTranslation();
  const testPlein = ligne.enTest && ligne.comptesTotal >= reglages.testPodComptes;
  return (
    <li className="space-y-3 rounded-lg border p-3" data-testid={`pod-${ligne.nom}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{ligne.nom}</span>
        <span className="inline-flex gap-1">
          {ligne.apps.map((a) => (
            <LogoApplication key={a} slug={a} taille="xs" />
          ))}
        </span>
        <Phase ligne={ligne} reglages={reglages} />
      </div>

      {ligne.enTest && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Points n={Math.min(ligne.comptesTotal, reglages.testPodComptes)} max={reglages.testPodComptes} />
            {t("repartition.podzComptesTest", { n: ligne.comptesTotal, max: reglages.testPodComptes })}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-20 rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-foreground/70"
                style={{ width: `${Math.min(100, (100 * ligne.posts) / reglages.testPodPosts)}%` }}
              />
            </span>
            {t("repartition.podzPostsTest", { n: ligne.posts, max: reglages.testPodPosts })}
          </span>
          <span className="text-muted-foreground">
            {t("repartition.podzSortie", { posts: reglages.testPodPosts, seuil: String(reglages.fermeturePerf).replace(".", ",") })}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {testPlein ? t("repartition.podzAttendTest") : t("repartition.podzParLangue")}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {ligne.langues.map((l) => {
            const prete = l.prochaine && !testPlein;
            return (
              <li
                key={l.langue}
                data-testid={`pod-langue-${l.langue}`}
                data-prete={prete ? "oui" : "non"}
                title={`${nomLangue(l.langue)} : ${t("repartition.podzComptes", { count: l.comptes })} · ${prete ? t("repartition.podzProchain") : t("repartition.podzAttend")}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums",
                  prete ? "border-foreground/60 bg-background font-medium" : "border-dashed border-muted-foreground/50 text-muted-foreground",
                )}
              >
                <span aria-hidden>{drapeauLangue(l.langue)}</span>
                <span className="uppercase">{l.langue}</span>
                <span className={cn("rounded px-1", prete ? "bg-foreground text-background" : "bg-muted")}>{l.comptes}</span>
                <span className="sr-only">{prete ? t("repartition.podzProchain") : t("repartition.podzAttend")}</span>
              </li>
            );
          })}
        </ul>
        {ligne.nonLivrees.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {t("repartition.podzNonLivre", { liste: ligne.nonLivrees.map((l) => l.toUpperCase()).join(", ") })}
          </p>
        )}
      </div>
    </li>
  );
}

export function CartePodz({
  applications,
  marchesParApp,
  reglages,
}: {
  applications: ApplicationCandidate[];
  marchesParApp: Record<string, Array<{ langue: string; pays: string | null; stats: StatLabel[] }>>;
  reglages: ReglagesChoixLabel;
}) {
  const { t } = useTranslation();
  const lignes = React.useMemo(() => lignesPodz(applications, marchesParApp, reglages), [applications, marchesParApp, reglages]);

  return (
    <Card data-testid="carte-podz">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" aria-hidden />
          {t("repartition.podzTitre")}
          <Aide libelle={t("repartition.podzTitre")}>{t("repartition.podzAide")}</Aide>
        </CardTitle>
        <CardDescription>{t("repartition.podzDescription", { test: reglages.testPodComptes })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label={t("repartition.podzTitre")}>
          {[
            t("repartition.podzEtapeTest", { n: reglages.testPodComptes }),
            t("repartition.podzEtapeSortie", { posts: reglages.testPodPosts, seuil: String(reglages.fermeturePerf).replace(".", ",") }),
            t("repartition.podzEtapeLangues"),
          ].map((etape, i) => (
            <li key={etape} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground" aria-hidden>→</span>}
              <span className="rounded-md border bg-muted/40 px-2 py-1">
                <span className="mr-1 font-semibold">{i + 1}.</span>
                {etape}
              </span>
            </li>
          ))}
        </ol>
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("repartition.podzVide")}</p>
        ) : (
          <>
            <ul className="space-y-3">
              {lignes.map((l) => (
                <Pod key={l.label_id} ligne={l} reglages={reglages} />
              ))}
            </ul>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-3.5 rounded-[4px] border border-foreground/60 bg-background" aria-hidden />
                {t("repartition.podzProchain")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-3.5 rounded-[4px] border border-dashed border-muted-foreground/60" aria-hidden />
                {t("repartition.podzAttend")}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
