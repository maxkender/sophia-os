import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplication } from "@/features/moteur/ApplicationContext";
import {
  avecFileLabelsApplication,
  fileLabelsDeLApplication,
} from "@/features/moteur/applications";
import {
  aujourdhuiParis,
  ecrireReglage,
  lireReglages,
  listerLabelIdsAvecUgc,
  listerLabels,
} from "@/features/moteur/api";
import { estLabelFileSlideshow } from "@/features/moteur/fileLabelsSlideshow";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { VOIX_PAPIER, type DureeClipReglage } from "@/features/moteur/papierReglages";
import {
  SCHEMA_ASSIGNATION,
  SCHEMA_UPDATE_ELO,
  schemaCleaning,
  type PipelineAction,
  type PipelineStep,
} from "@/features/moteur/pipelinesSchema";
import type { FileLabelCompteItem, Reglages, ReglagesFileLabels } from "@/features/moteur/types";
import { cn } from "@/lib/utils";

/** `"general"` ou code langue. */
type FileQueueKey = "general" | (typeof LANGUES_CIBLES)[number];

function itemsDeLaFile(file: ReglagesFileLabels, key: FileQueueKey): FileLabelCompteItem[] {
  if (key === "general") return file.items;
  return file.par_langue[key] ?? [];
}

function avecItemsFile(
  file: ReglagesFileLabels,
  key: FileQueueKey,
  items: FileLabelCompteItem[],
): ReglagesFileLabels {
  if (key === "general") return { ...file, items };
  const par_langue = { ...file.par_langue };
  if (items.length === 0) delete par_langue[key];
  else par_langue[key] = items;
  return { ...file, par_langue };
}

function ChampNombre({
  id,
  label,
  valeur,
  onChange,
  min = 0,
  max,
  step,
}: {
  id: string;
  label: string;
  valeur: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={valeur}
        onChange={(e) => {
          let n = Number(e.target.value);
          if (max != null) n = Math.min(max, n);
          if (min != null) n = Math.max(min, n);
          onChange(n);
        }}
      />
    </div>
  );
}

function kindBadge(kind: PipelineStep["kind"], t: (k: string) => string): string {
  switch (kind) {
    case "api":
      return t("reglages.schemaKindApi");
    case "fallback":
      return t("reglages.schemaKindFallback");
    case "gate":
      return t("reglages.schemaKindGate");
    case "persist":
      return t("reglages.schemaKindPersist");
    default:
      return t("reglages.schemaKindLogic");
  }
}

function kindClass(kind: PipelineStep["kind"]): string {
  switch (kind) {
    case "api":
      return "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300";
    case "fallback":
      return "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300";
    case "gate":
      return "border-rose-600/30 bg-rose-600/10 text-rose-800 dark:text-rose-300";
    case "persist":
      return "border-sky-600/30 bg-sky-600/10 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function SchemaPipeline({ action }: { action: PipelineAction }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("reglages.schemaTitre")}
        </p>
        <code className="text-[11px] text-muted-foreground">{action.edge}</code>
      </div>
      <p className="text-xs text-muted-foreground">{action.description}</p>
      <ol className="space-y-2">
        {action.steps.map((s) => (
          <li
            key={s.id}
            className="rounded-md border border-border/60 bg-background/80 px-2.5 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              {s.rang ? (
                <span className="font-mono text-xs text-muted-foreground">{s.rang}</span>
              ) : null}
              <span className="font-medium">{s.label}</span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  kindClass(s.kind),
                )}
              >
                {kindBadge(s.kind, t)}
              </span>
            </div>
            <dl className="mt-1.5 grid gap-0.5 text-xs text-muted-foreground sm:grid-cols-2">
              {s.api && (
                <div>
                  <dt className="inline text-[10px] uppercase tracking-wide opacity-70">
                    {t("reglages.schemaApi")} ·{" "}
                  </dt>
                  <dd className="inline font-mono text-foreground/80">{s.api}</dd>
                </div>
              )}
              {s.env && (
                <div>
                  <dt className="inline text-[10px] uppercase tracking-wide opacity-70">
                    {t("reglages.schemaEnv")} ·{" "}
                  </dt>
                  <dd className="inline font-mono text-foreground/80">{s.env}</dd>
                </div>
              )}
              {s.reglage && (
                <div>
                  <dt className="inline text-[10px] uppercase tracking-wide opacity-70">
                    {t("reglages.schemaReglage")} ·{" "}
                  </dt>
                  <dd className="inline font-mono text-foreground/80">{s.reglage}</dd>
                </div>
              )}
              {s.onFail && (
                <div className="sm:col-span-2">
                  <dt className="inline text-[10px] uppercase tracking-wide opacity-70">
                    {t("reglages.schemaOnFail")} ·{" "}
                  </dt>
                  <dd className="inline">{s.onFail}</dd>
                </div>
              )}
              {s.detail && (
                <div className="sm:col-span-2">
                  <dd>{s.detail}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ol>
      {action.constants && action.constants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("reglages.schemaConstants")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {action.constants.map((c) => (
              <Badge
                key={c.cle}
                variant="secondary"
                className="font-mono text-[10px] font-normal"
                title={c.detail}
              >
                {c.cle} = {c.valeur}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminReglagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { applicationId, slug } = useApplication();
  const { data, isPending } = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });
  const labels = useQuery({
    queryKey: ["labels", applicationId],
    queryFn: () => listerLabels(applicationId),
    enabled: Boolean(applicationId),
  });
  const labelsUgc = useQuery({
    queryKey: ["labels-avec-ugc", applicationId],
    queryFn: () => listerLabelIdsAvecUgc(applicationId),
    staleTime: 30_000,
    enabled: Boolean(applicationId),
  });

  const [brouillon, setBrouillon] = React.useState<Reglages | null>(null);
  const reglages = brouillon ?? data ?? null;
  const [labelAjout, setLabelAjout] = React.useState("");
  const [ugcAjout, setUgcAjout] = React.useState(false);
  const [fileSauveAt, setFileSauveAt] = React.useState<number | null>(null);
  const [fileQueueKey, setFileQueueKey] = React.useState<FileQueueKey>("general");


  const enregistrer = useMutation({
    mutationFn: async (r: Reglages) => {
      await ecrireReglage("repartition", r.repartition);
      await ecrireReglage("frequence", r.frequence);
      await ecrireReglage("semaine1", r.semaine1);
      await ecrireReglage("scoring", r.scoring);
      await ecrireReglage("moteur_vnext", r.moteur_vnext);
      await ecrireReglage("assignation_auto", r.assignation_auto);
      await ecrireReglage("nettoyage", r.nettoyage);
      // File déjà autosauvegardée à chaque edit — on resync quand même.
      await ecrireReglage("file_labels_comptes", r.file_labels_comptes);
      await ecrireReglage("warmup", r.warmup);
      await ecrireReglage("papier", r.papier);
    },
    onSuccess: () => {
      setBrouillon(null);
      queryClient.invalidateQueries({ queryKey: ["reglages"] });
    },
  });

  /** File admin : persistée immédiatement (prévaut sur l’auto à la création). */
  const persisterFile = useMutation({
    mutationFn: (file: Reglages["file_labels_comptes"]) =>
      ecrireReglage("file_labels_comptes", file),
    onSuccess: (_void, file) => {
      setFileSauveAt(Date.now());
      queryClient.setQueryData<Reglages>(["reglages"], (old) =>
        old ? { ...old, file_labels_comptes: file } : old,
      );
    },
  });

  if (isPending || !reglages) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const maj = (patch: Partial<Reglages>) => setBrouillon({ ...reglages, ...patch });
  const fileApp = fileLabelsDeLApplication(reglages.file_labels_comptes, slug);
  const majFile = (items: FileLabelCompteItem[]) => {
    const slice = avecItemsFile(fileApp, fileQueueKey, items);
    const file = avecFileLabelsApplication(reglages.file_labels_comptes, slug, slice);
    setBrouillon({ ...reglages, file_labels_comptes: file });
    persisterFile.mutate(file);
  };
  const majScoring = (patch: Partial<Reglages["scoring"]>) =>
    maj({ scoring: { ...reglages.scoring, ...patch } });
  const total =
    reglages.repartition.recycle + reglages.repartition.remanie + reglages.repartition.nouveau;
  const totalValide = total === 100;
  const fileActive = itemsDeLaFile(fileApp, fileQueueKey);
  const cleaningSchema = schemaCleaning(reglages.nettoyage.provider_principal);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("reglages.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("reglages.subtitleActions")}</p>
      </div>

      {/* ── Cleaning ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reglages.actionCleaning")}</CardTitle>
          <CardDescription>{t("reglages.actionCleaningDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SchemaPipeline action={cleaningSchema} />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.nettoyageOrdre")}</h3>
            <p className="text-xs text-muted-foreground">{t("reglages.nettoyageAide")}</p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="nettoyage-provider"
                  className="mt-1"
                  checked={reglages.nettoyage.provider_principal === "fal"}
                  onChange={() => maj({ nettoyage: { provider_principal: "fal" } })}
                />
                <span>
                  <span className="font-medium">{t("reglages.nettoyageFalPremier")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("reglages.nettoyageFalPremierAide")}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="nettoyage-provider"
                  className="mt-1"
                  checked={reglages.nettoyage.provider_principal === "replicate"}
                  onChange={() => maj({ nettoyage: { provider_principal: "replicate" } })}
                />
                <span>
                  <span className="font-medium">{t("reglages.nettoyageReplicatePremier")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("reglages.nettoyageReplicatePremierAide")}
                  </span>
                </span>
              </label>
            </div>
          </section>
        </CardContent>
      </Card>

      {/* ── Update ELO ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reglages.actionElo")}</CardTitle>
          <CardDescription>{t("reglages.actionEloDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SchemaPipeline action={SCHEMA_UPDATE_ELO} />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.eloImportParams")}</h3>
            <p className="text-xs text-muted-foreground">{t("reglages.eloVuesAide")}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="elo"
                label={t("reglages.eloSeuil")}
                valeur={reglages.scoring.elo_seuil_import}
                onChange={(n) => majScoring({ elo_seuil_import: n })}
              />
              <ChampNombre
                id="eloPoids"
                label={t("reglages.eloPoidsVues")}
                min={0}
                step={0.05}
                valeur={reglages.scoring.elo_poids_vues}
                onChange={(n) => majScoring({ elo_poids_vues: Math.min(1, Math.max(0, n)) })}
              />
              <ChampNombre
                id="eloPlafond"
                label={t("reglages.eloVuesPlafond")}
                min={10_000}
                step={10_000}
                valeur={reglages.scoring.elo_vues_plafond}
                onChange={(n) => majScoring({ elo_vues_plafond: n })}
              />
              <ChampNombre
                id="eloK"
                label={t("reglages.eloRegularisation")}
                min={0.1}
                step={0.1}
                valeur={reglages.scoring.elo_regularisation_k}
                onChange={(n) => majScoring({ elo_regularisation_k: Math.max(0.1, n) })}
              />
              <ChampNombre
                id="pert"
                label={t("reglages.pertinence")}
                valeur={reglages.scoring.pertinence_seuil}
                onChange={(n) => majScoring({ pertinence_seuil: n })}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.eloRuntimePause")}</h3>
            <p className="text-xs text-muted-foreground">{t("reglages.eloRuntimePauseAide")}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="ewma"
                label={t("reglages.ewma")}
                step={0.05}
                valeur={reglages.scoring.ewma_alpha}
                onChange={(n) => majScoring({ ewma_alpha: n })}
              />
              <ChampNombre
                id="regk"
                label={t("reglages.regularisation")}
                valeur={reglages.scoring.regularisation_k}
                onChange={(n) => majScoring({ regularisation_k: n })}
              />
              <ChampNombre
                id="transfert"
                label={t("reglages.transfert")}
                step={0.05}
                valeur={reglages.scoring.transfert_inter_langue}
                onChange={(n) => majScoring({ transfert_inter_langue: n })}
              />
            </div>
          </section>
        </CardContent>
      </Card>

      {/* ── Assignation ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reglages.actionAssignation")}</CardTitle>
          <CardDescription>{t("reglages.actionAssignationDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SchemaPipeline action={SCHEMA_ASSIGNATION} />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.vnextTitle")}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reglages.moteur_vnext.actif}
                onChange={(e) => maj({ moteur_vnext: { actif: e.target.checked } })}
              />
              {t("reglages.vnextActif")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!reglages.assignation_auto.actif}
                onChange={(e) => maj({ assignation_auto: { actif: !e.target.checked } })}
              />
              {t("reglages.assignationAutoPause")}
            </label>
            <p className="text-xs text-muted-foreground">{t("reglages.assignationAutoAide")}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.assignationParams")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="parJour"
                label={t("reglages.postsParJour")}
                min={1}
                max={3}
                valeur={reglages.frequence.posts_par_jour}
                onChange={(n) => maj({ frequence: { posts_par_jour: n } })}
              />
              <ChampNombre
                id="topk"
                label={t("reglages.topK")}
                min={1}
                valeur={reglages.scoring.top_k}
                onChange={(n) => majScoring({ top_k: n })}
              />
              <ChampNombre
                id="temp"
                label={t("reglages.temperature")}
                step={0.1}
                valeur={reglages.scoring.temperature}
                onChange={(n) => majScoring({ temperature: n })}
              />
              <ChampNombre
                id="satj"
                label={t("reglages.saturationJours")}
                min={1}
                valeur={reglages.scoring.saturation_jours}
                onChange={(n) => majScoring({ saturation_jours: n })}
              />
              <ChampNombre
                id="satp"
                label={t("reglages.saturationPenalite")}
                step={0.05}
                valeur={reglages.scoring.saturation_penalite}
                onChange={(n) => majScoring({ saturation_penalite: n })}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.variationParams")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="vseuil"
                label={t("reglages.varSeuil")}
                valeur={reglages.scoring.variation_seuil_score}
                onChange={(n) => majScoring({ variation_seuil_score: n })}
              />
              <ChampNombre
                id="vpass"
                label={t("reglages.varPassages")}
                min={1}
                valeur={reglages.scoring.variation_min_passages}
                onChange={(n) => majScoring({ variation_min_passages: n })}
              />
              <ChampNombre
                id="vage"
                label={t("reglages.varAge")}
                min={1}
                valeur={reglages.scoring.variation_age_jours}
                onChange={(n) => majScoring({ variation_age_jours: n })}
              />
              <ChampNombre
                id="vprof"
                label={t("reglages.varProfondeur")}
                min={1}
                valeur={reglages.scoring.variation_profondeur_max}
                onChange={(n) => majScoring({ variation_profondeur_max: n })}
              />
            </div>
          </section>
        </CardContent>
      </Card>

      {/* ── Papier CM ── */}
      <Card id="papier">
        <CardHeader>
          <CardTitle>{t("reglages.actionPapier")}</CardTitle>
          <CardDescription>{t("reglages.actionPapierDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <section className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!reglages.papier.actif}
                onChange={(e) =>
                  maj({ papier: { ...reglages.papier, actif: !e.target.checked } })
                }
              />
              {t("reglages.papierPause")}
            </label>
            <p className="text-xs text-muted-foreground">{t("reglages.papierPauseAide")}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.papierDuree")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChampNombre
                id="papierDuree"
                label={t("reglages.papierDureeSec")}
                min={20}
                max={90}
                valeur={reglages.papier.duree_cible_sec}
                onChange={(n) => maj({ papier: { ...reglages.papier, duree_cible_sec: n } })}
              />
              <div className="space-y-2">
                <Label htmlFor="papierClip">{t("reglages.papierDureeClip")}</Label>
                <select
                  id="papierClip"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={String(reglages.papier.duree_clip)}
                  onChange={(e) => {
                    const v = e.target.value;
                    const duree_clip: DureeClipReglage =
                      v === "4" || v === "6" || v === "8" ? (Number(v) as 4 | 6 | 8) : "auto";
                    maj({ papier: { ...reglages.papier, duree_clip } });
                  }}
                >
                  <option value="auto">{t("reglages.papierClipAuto")}</option>
                  <option value="4">4 s</option>
                  <option value="6">6 s</option>
                  <option value="8">8 s</option>
                </select>
                <p className="text-xs text-muted-foreground">{t("reglages.papierDureeAide")}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.papierVoix")}</h3>
            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="papierVoix">{t("reglages.papierVoixDefaut")}</Label>
              <select
                id="papierVoix"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={reglages.papier.voix}
                onChange={(e) => maj({ papier: { ...reglages.papier, voix: e.target.value } })}
              >
                {VOIX_PAPIER.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LANGUES_CIBLES.map((code) => (
                <div key={code} className="space-y-1">
                  <Label htmlFor={`papier-voix-${code}`} className="text-xs">
                    {nomLangue(code)}
                  </Label>
                  <select
                    id={`papier-voix-${code}`}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={reglages.papier.voix_par_langue[code] ?? ""}
                    onChange={(e) => {
                      const voix_par_langue = { ...reglages.papier.voix_par_langue };
                      if (e.target.value) voix_par_langue[code] = e.target.value;
                      else delete voix_par_langue[code];
                      maj({ papier: { ...reglages.papier, voix_par_langue } });
                    }}
                  >
                    <option value="">{t("reglages.papierVoixSuivre")}</option>
                    {VOIX_PAPIER.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 sm:max-w-xs">
            <ChampNombre
              id="papierQuota"
              label={t("reglages.papierQuota")}
              min={0}
              valeur={reglages.papier.fal_quota_jour}
              onChange={(n) => maj({ papier: { ...reglages.papier, fal_quota_jour: n } })}
            />
            <p className="text-xs text-muted-foreground">
              {t("reglages.papierQuotaAide")}
              {" · "}
              {reglages.papier.fal_quota_jour <= 0
                ? t("reglages.papierQuotaIllimite", {
                    n:
                      reglages.papier_fal_usage.date === aujourdhuiParis()
                        ? reglages.papier_fal_usage.appels
                        : 0,
                  })
                : t("reglages.papierQuotaUsage", {
                    n:
                      reglages.papier_fal_usage.date === aujourdhuiParis()
                        ? reglages.papier_fal_usage.appels
                        : 0,
                    max: reglages.papier.fal_quota_jour,
                  })}
            </p>
          </section>
        </CardContent>
      </Card>

      {/* ── Warmup + file labels ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("warmup.settingsTitre")}</CardTitle>
          <CardDescription>{t("warmup.settingsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <section className="space-y-3 sm:max-w-xs">
            <ChampNombre
              id="warmupH"
              label={t("warmup.heures")}
              min={1}
              max={168}
              valeur={reglages.warmup.heures}
              onChange={(n) => maj({ warmup: { heures: n } })}
            />
            <p className="text-xs text-muted-foreground">{t("warmup.heuresAide")}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("warmup.fileTitre")}</h3>
            <p className="text-xs font-medium text-foreground">
              {t("warmup.fileApp", { nom: slug === "sophia" ? "Sophia" : slug })}
            </p>
            <p className="text-xs text-muted-foreground">{t("warmup.fileDesc")}</p>
            <p className="text-xs text-muted-foreground">
              {t("warmup.fileAutosave")}
              {persisterFile.isPending
                ? ` — ${t("common.saving")}`
                : fileSauveAt
                  ? ` — ${t("warmup.fileSauvee")}`
                  : ""}
            </p>

            <div className="space-y-1 sm:max-w-sm">
              <Label htmlFor="fileQueueKey">{t("warmup.fileChoisir")}</Label>
              <select
                id="fileQueueKey"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={fileQueueKey}
                onChange={(e) => {
                  const v = e.target.value;
                  setFileQueueKey(
                    v === "general" || (LANGUES_CIBLES as readonly string[]).includes(v)
                      ? (v as FileQueueKey)
                      : "general",
                  );
                }}
              >
                <option value="general">
                  {t("warmup.fileGenerale")} ({fileApp.items.length})
                </option>
                {LANGUES_CIBLES.map((code) => {
                  const n = (fileApp.par_langue[code] ?? []).length;
                  return (
                    <option key={code} value={code}>
                      {nomLangue(code)} ({n})
                      {n > 0 ? ` — ${t("warmup.filePrioritaire")}` : ""}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-muted-foreground">
                {fileQueueKey === "general"
                  ? t("warmup.fileGeneraleAide")
                  : t("warmup.fileLangueAide", { langue: nomLangue(fileQueueKey) })}
              </p>
            </div>

            <ol className="space-y-1.5">
              {fileActive.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  {fileQueueKey === "general"
                    ? t("warmup.fileVideListe")
                    : t("warmup.fileLangueVide")}
                </li>
              )}
              {fileActive.map((item, i) => {
                const lab = (labels.data ?? []).find((l) => l.id === item.label_id);
                const horsSlideshow = lab ? !estLabelFileSlideshow(lab) : false;
                return (
                  <li
                    key={`${fileQueueKey}-${item.label_id}-${item.ugc}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span className="truncate">{lab?.nom ?? item.label_id.slice(0, 8)}</span>
                      {item.ugc && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          UGC
                        </Badge>
                      )}
                      {horsSlideshow && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {t("warmup.fileIgnoreUgcVideo")}
                        </Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={i === 0 || persisterFile.isPending}
                        onClick={() => {
                          const items = [...fileActive];
                          [items[i - 1], items[i]] = [items[i]!, items[i - 1]!];
                          majFile(items);
                        }}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={i >= fileActive.length - 1 || persisterFile.isPending}
                        onClick={() => {
                          const items = [...fileActive];
                          [items[i], items[i + 1]] = [items[i + 1]!, items[i]!];
                          majFile(items);
                        }}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={persisterFile.isPending}
                        onClick={() => {
                          majFile(fileActive.filter((_, j) => j !== i));
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label htmlFor="ajoutLabel">{t("warmup.ajouterLabel")}</Label>
                <select
                  id="ajoutLabel"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  value={labelAjout}
                  onChange={(e) => setLabelAjout(e.target.value)}
                >
                  <option value="">{t("common.none")}</option>
                  {(labels.data ?? [])
                    .filter((l) => estLabelFileSlideshow(l))
                    .filter((l) => !ugcAjout || (labelsUgc.data ?? []).includes(l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nom}
                      </option>
                    ))}
                </select>
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ugcAjout}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setUgcAjout(on);
                    if (
                      on &&
                      labelAjout &&
                      !(labelsUgc.data ?? []).includes(labelAjout)
                    ) {
                      setLabelAjout("");
                    }
                  }}
                />
                {t("warmup.ajouterUgc")}
              </label>
              <Button
                type="button"
                size="sm"
                disabled={
                  !labelAjout ||
                  persisterFile.isPending ||
                  (ugcAjout && !(labelsUgc.data ?? []).includes(labelAjout))
                }
                onClick={() => {
                  majFile([...fileActive, { label_id: labelAjout, ugc: ugcAjout }]);
                  setLabelAjout("");
                  setUgcAjout(false);
                }}
              >
                {t("warmup.ajouter")}
              </Button>
            </div>
            {ugcAjout && (labelsUgc.data ?? []).length === 0 && (
              <p className="text-xs text-destructive">{t("warmup.aucunLabelUgc")}</p>
            )}
            {persisterFile.isError && (
              <p className="text-xs text-destructive">
                {(persisterFile.error as Error).message}
              </p>
            )}
          </section>
        </CardContent>
      </Card>

      {/* ── Legacy ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reglages.legacyTitle")}</CardTitle>
          <CardDescription>{t("reglages.legacySubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.repartition")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="recycle"
                label={t("reglages.recycle")}
                valeur={reglages.repartition.recycle}
                onChange={(n) => maj({ repartition: { ...reglages.repartition, recycle: n } })}
              />
              <ChampNombre
                id="remanie"
                label={t("reglages.remanie")}
                valeur={reglages.repartition.remanie}
                onChange={(n) => maj({ repartition: { ...reglages.repartition, remanie: n } })}
              />
              <ChampNombre
                id="nouveau"
                label={t("reglages.nouveau")}
                valeur={reglages.repartition.nouveau}
                onChange={(n) => maj({ repartition: { ...reglages.repartition, nouveau: n } })}
              />
            </div>
            <p className={totalValide ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
              {totalValide ? t("reglages.total", { total }) : t("reglages.totalInvalide")}
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.semaine1")}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reglages.semaine1.actif}
                onChange={(e) =>
                  maj({ semaine1: { ...reglages.semaine1, actif: e.target.checked } })
                }
              />
              {t("reglages.semaine1Actif")}
            </label>
            {reglages.semaine1.actif && (
              <div className="grid gap-4 sm:grid-cols-3">
                <ChampNombre
                  id="s1jours"
                  label={t("reglages.semaine1Jours")}
                  min={1}
                  valeur={reglages.semaine1.jours}
                  onChange={(n) => maj({ semaine1: { ...reglages.semaine1, jours: n } })}
                />
                <ChampNombre
                  id="s1posts"
                  label={t("reglages.semaine1Posts")}
                  min={1}
                  max={3}
                  valeur={reglages.semaine1.posts_par_jour}
                  onChange={(n) =>
                    maj({ semaine1: { ...reglages.semaine1, posts_par_jour: n } })
                  }
                />
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reglages.semaine1.tout_recycle}
                    onChange={(e) =>
                      maj({ semaine1: { ...reglages.semaine1, tout_recycle: e.target.checked } })
                    }
                  />
                  {t("reglages.semaine1Recycle")}
                </label>
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          disabled={!brouillon || !totalValide || enregistrer.isPending}
          onClick={() => enregistrer.mutate(reglages)}
        >
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
        {enregistrer.isError && (
          <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
