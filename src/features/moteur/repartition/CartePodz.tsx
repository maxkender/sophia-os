import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import { Aide } from "./graphes";
import type { ApplicationCandidate } from "./scoreApplication";
import { comptesCible, passerEnPaliers, type PalierPodz } from "./paliersPodz";
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
 *
 * PALIERS (0874) : un label au palier n'est plus en test. La carte montre son
 * palier (7 langues × 1, 14 × 1, 14 × 2), ses comptes face à la cible et le r
 * de sa semaine ; un ancien label se bascule d'un clic, sans perdre de compte.
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

function Phase({ ligne, reglages, palier }: { ligne: LignePod; reglages: ReglagesChoixLabel; palier?: PalierPodz }) {
  const { t } = useTranslation();
  if (palier?.palier) {
    return (
      <span className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400" data-testid="pod-palier">
        {t("repartition.podzPalier", { n: palier.palier })}
      </span>
    );
  }
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

function BlocPalier({ palier }: { palier: PalierPodz }) {
  const { t } = useTranslation();
  const cible = comptesCible(palier);
  const r = palier.r_semaine === null ? "—" : String(palier.r_semaine).replace(".", ",");
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" data-testid="bloc-palier">
      <span>
        {t("repartition.podzPalierCible", { langues: palier.langues_cible ?? 0, parLangue: palier.comptes_par_langue ?? 0 })}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-20 rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-foreground/70"
            style={{ width: `${cible ? Math.min(100, (100 * palier.comptes) / cible) : 0}%` }}
          />
        </span>
        {t("repartition.podzPalierComptes", { n: palier.comptes, max: cible ?? 0 })}
      </span>
      <span>{t("repartition.podzPalierR", { r, posts: palier.passages_semaine })}</span>
      <span className="text-muted-foreground">
        {palier.palier && palier.palier >= 3
          ? t("repartition.podzPalierDernier")
          : t("repartition.podzPalierMontee", {
              date: palier.montee_possible_le ? new Date(palier.montee_possible_le).toLocaleDateString("fr-FR") : "—",
            })}
      </span>
    </div>
  );
}

function Pod({
  ligne,
  reglages,
  palier,
  onBasculer,
  bascule,
}: {
  ligne: LignePod;
  reglages: ReglagesChoixLabel;
  palier?: PalierPodz;
  onBasculer?: () => void;
  bascule?: boolean;
}) {
  const { t } = useTranslation();
  const auPalier = Boolean(palier?.palier);
  const testPlein = !auPalier && ligne.enTest && ligne.comptesTotal >= reglages.testPodComptes;
  return (
    <li className="space-y-3 rounded-lg border p-3" data-testid={`pod-${ligne.nom}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{ligne.nom}</span>
        <span className="inline-flex gap-1">
          {ligne.apps.map((a) => (
            <LogoApplication key={a} slug={a} taille="xs" />
          ))}
        </span>
        <Phase ligne={ligne} reglages={reglages} palier={palier} />
        {!auPalier && palier && onBasculer && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs"
            disabled={bascule}
            data-testid="pod-basculer-paliers"
            onClick={() => {
              if (window.confirm(t("repartition.podzBasculerConfirm", { label: ligne.nom, comptes: palier.comptes }))) onBasculer();
            }}
          >
            {t("repartition.podzBasculer")}
          </Button>
        )}
      </div>

      {auPalier && palier && <BlocPalier palier={palier} />}

      {!auPalier && ligne.enTest && (
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
  paliers = [],
}: {
  applications: ApplicationCandidate[];
  marchesParApp: Record<string, Array<{ langue: string; pays: string | null; stats: StatLabel[] }>>;
  reglages: ReglagesChoixLabel;
  /** `podz_paliers_etat` (0874) : le palier de chaque label 100 % podz. */
  paliers?: PalierPodz[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const lignes = React.useMemo(() => lignesPodz(applications, marchesParApp, reglages), [applications, marchesParApp, reglages]);
  const palierParLabel = React.useMemo(() => new Map(paliers.map((p) => [p.label_id, p])), [paliers]);
  const basculer = useMutation({
    mutationFn: (labelId: string) => passerEnPaliers(labelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["podz-paliers"] }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  });

  return (
    <Card data-testid="carte-podz">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" aria-hidden />
          {t("repartition.podzTitre")}
          <Aide libelle={t("repartition.podzTitre")}>{t("repartition.podzAide")}</Aide>
        </CardTitle>
        <CardDescription>{t("repartition.podzDescriptionPaliers", { test: reglages.testPodComptes })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label={t("repartition.podzPaliersTitre")}>
          {[
            t("repartition.podzEtapePalier1"),
            t("repartition.podzEtapePalier2"),
            t("repartition.podzEtapePalier3"),
          ].map((etape, i) => (
            <li key={etape} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground" aria-hidden>{t("repartition.podzEtapeMontee")}</span>}
              <span className="rounded-md border border-sky-600/40 bg-sky-600/5 px-2 py-1">
                <span className="mr-1 font-semibold">{t("repartition.podzPalier", { n: i + 1 })}</span>
                {etape}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-muted-foreground">{t("repartition.podzAncienTest")}</p>
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
                <Pod
                  key={l.label_id}
                  ligne={l}
                  reglages={reglages}
                  palier={palierParLabel.get(l.label_id)}
                  onBasculer={() => basculer.mutate(l.label_id)}
                  bascule={basculer.isPending}
                />
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
